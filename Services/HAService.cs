using DDDHibernate.DomainServices.DomainStructure;

using HA_DailyRoutes.APIs;
using HA_DailyRoutes.Entities;
using HA_DailyRoutes.Models.DTOs;
using HA_DailyRoutes.Models.DTOs.HomeAssistant;

using NHibernate.Util;

public class HAService
{
    private readonly IHomeAssistantApi haApi;
    private readonly IDomainService<GpsHistory> gpsHistoryDS;
    private readonly IDomainService<GpsRoute> gpsRouteDS;

    public HAService(IHomeAssistantApi haApi, IDomainService<GpsHistory> gpsHistoryDS, IDomainService<GpsRoute> gpsRouteDS, IDomainService<Zone> zoneDS)
    {
        this.haApi = haApi;
        this.gpsHistoryDS = gpsHistoryDS;
        this.gpsRouteDS = gpsRouteDS;
    }

    public IEnumerable<RouteDTO> GetHistory(int days)
    {
        var startFrom = DateTime.Now.Date.AddDays(-days);
        var gpsRoutes = GetArchivedGpsRoutes(startFrom);

        var lastRoute = gpsRoutes.OrderBy(x => x.End).LastOrDefault();
        startFrom = lastRoute is not null ? lastRoute.End : startFrom;
        var gpsHistoryItems = GetArchivedGpsHistory(startFrom);

        //Сохранение новых локаций в локальную БД
        var lastPoint = gpsHistoryItems.LastOrDefault();
        startFrom = lastPoint?.GpsStamp ?? startFrom;

        var historyItems = PullNewGpsPoints(startFrom);
        historyItems = FilterActualPoints(startFrom, historyItems);
        FilterStaingPoints(lastPoint, historyItems);
        ArchiveNewGpsHistory(gpsHistoryItems, historyItems);

        //Создание маршрутов
        FilterNearPoints(gpsHistoryItems);
        var newGpsRoutes = BuildGpsRoutes(gpsHistoryItems);
        newGpsRoutes.Where(x => x.GpsPoints.All(y => y.GpsRoute == null))
            .ToList()
            .ForEach(x => gpsRouteDS.Save(x));

        IEnumerable<GpsRoute> routes = gpsRoutes.Concat(newGpsRoutes);

        return ConvertRoutesToDTO(routes);
    }

    /// <summary>
    /// Сохранает новую локацию
    /// </summary>
    /// <param name="gpsHistoryItems"></param>
    /// <param name="entityHistoryItems"></param>
    private void ArchiveNewGpsHistory(List<GpsHistory> gpsHistoryItems, List<TrackerStateDTO> entityHistoryItems)
    {
        entityHistoryItems.ForEach(x =>
        {
            gpsHistoryItems.Add(gpsHistoryDS.Save(new GpsHistory()
            {
                GpsStamp = x.LastChanged,
                GpsAccuracy = x.Attributes.GpsAccuracy,
                Latitude = x.Attributes.Latitude,
                Longitude = x.Attributes.Longitude,
                Name = x.EntityId,
                State = x.State,
            }));
        });
    }

    /// <summary>
    /// Возвращает ранее сохраненные локации
    /// </summary>
    /// <param name="startFrom"></param>
    /// <returns></returns>
    private List<GpsHistory> GetArchivedGpsHistory(DateTime startFrom) => gpsHistoryDS.GetAll()
        .Where(x => x.GpsStamp >= startFrom)
        .OrderBy(x => x.GpsStamp)
        .ToList();

    /// <summary>
    /// Возвращает ранее сохраненные маршруты
    /// </summary>
    /// <param name="startFrom"></param>
    /// <returns></returns>
    private List<GpsRoute> GetArchivedGpsRoutes(DateTime startFrom) => gpsRouteDS.GetAll()
        .Where(x => x.End > startFrom)
        .OrderBy(x => x.Start)
        .ToList();

    /// <summary>
    /// Удаляет точки с одинаковым состоянием, находящиеся слишком близко друг к другу
    /// </summary>
    /// <param name="gpsHistory"></param>
    private void FilterNearPoints(List<GpsHistory> gpsHistory)
    {
        for (int i = 1; i < gpsHistory.Count; i++)
        {
            if (gpsHistory[i].State == gpsHistory[i - 1].State && gpsHistory[i].DistanceTo(gpsHistory[i - 1]) < 50)
            {
                gpsHistory.RemoveAt(i);
                i--;
                continue;
            }
        }
    }

    /// <summary>
    /// Получить новые локации из HA
    /// </summary>
    /// <param name="startFrom"></param>
    /// <returns></returns>
    private List<TrackerStateDTO> PullNewGpsPoints(DateTime? startFrom) => haApi.GetLocationHistory(startFrom);

    /// <summary>
    /// Удаляет повторяющиеся точки присутствия в известных местах
    /// </summary>
    /// <param name="lastPoint"></param>
    /// <param name="historyItems"></param>
    private void FilterStaingPoints(GpsHistory? lastPoint, List<TrackerStateDTO> historyItems)
    {
        bool staing = lastPoint?.State != "not_home";
        for (int i = 0; i < historyItems.Count; i++)
        {
            if (historyItems[i].State != "not_home" && staing)
            {
                historyItems.RemoveAt(i--);
                continue;
            }

            if (historyItems[i].State != "not_home" && !staing)
                staing = true;

            if (historyItems[i].State == "not_home" && staing)
                staing = false;
        }
    }

    /// <summary>
    /// Оставляет только GPS коориднаты начиная с определенного времени
    /// </summary>
    /// <param name="startStamp"></param>
    /// <param name="historyItems"></param>
    private List<TrackerStateDTO> FilterActualPoints(DateTime? startStamp, List<TrackerStateDTO> historyItems)
    => historyItems.Where(x => x.Attributes.SourceType == "gps")
        .Where(x => x.LastChanged > startStamp)
        .ToList();

    private List<GpsRoute> BuildGpsRoutes(List<GpsHistory> gpsHistory)
    {
        var routes = new List<GpsRoute>();
        if (gpsHistory.Count == 0) return routes;

        var currentPoints = new List<GpsHistory> { gpsHistory[0] };
        GpsHistory asOriginPoint = null;

        for (int i = 1; i < gpsHistory.Count; i++)
        {
            var gap = (gpsHistory[i].GpsStamp - gpsHistory[i - 1].GpsStamp).TotalMinutes;

            if (gap < 30)
            {
                currentPoints.Add(gpsHistory[i]);
            }
            else
            {
                if (currentPoints.Count > 1)
                    routes.Add(CreateGpsRoute(currentPoints, asOriginPoint));

                currentPoints = new List<GpsHistory> { gpsHistory[i] };
                asOriginPoint = gpsHistory[i - 1];
            }
        }

        if (currentPoints.Count > 1 && DateTime.Now.Subtract(currentPoints.Last().GpsStamp).TotalHours > 1)
            routes.Add(CreateGpsRoute(currentPoints, asOriginPoint));

        return routes.Where(x => x != null).ToList();
    }

    private GpsRoute CreateGpsRoute(List<GpsHistory> points, GpsHistory asOriginPoint)
    => points.All(x => x.GpsRoute is null)
        ? new GpsRoute
        {
            AsOriginPoint = asOriginPoint,
            Start = points.First().GpsStamp,
            End = points.Last().GpsStamp,
            Origin = (asOriginPoint ?? points.First()).State,
            Destination = points.Last().State,
            GpsPoints = points
        }
        : null;

    private List<RouteDTO> ConvertRoutesToDTO(IEnumerable<GpsRoute> routes) => routes.Select((route, index) => new RouteDTO
    {
        Id = index,
        Date = route.Start.ToString("yyyy-MM-dd"),
        Name = $"{route.Start:t} {route.Origin} -> {route.End:t} {route.Destination}",
        Color = $"#{new Random(index).Next(0x1000000):X6}",
        Coordinates = route.AllPoints
            .OrderBy(x => x.GpsStamp)
            .Select(p => new List<double> { p.Latitude, p.Longitude })
            .ToList()
    }).ToList();
}