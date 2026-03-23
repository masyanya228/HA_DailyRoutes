using DDDHibernate.DomainServices.DomainStructure;
using DDDHibernate.Xtensions;

using HA_DailyRoutes;
using HA_DailyRoutes.Entities;
using HA_DailyRoutes.Models.DTOs;
using HA_DailyRoutes.Models.DTOs.HomeAssistant;

using NHibernate.Util;

public class HAService
{
    private readonly IHomeAssistantApi haApi;
    private readonly IDomainService<GpsHistory> gpsHistoryDS;
    private readonly IDomainService<GpsRoute> gpsRouteDS;
    private readonly IDomainService<Zone> zoneDS;


    private IEnumerable<Zone> _zones;
    private readonly object _lock = new();

    public IEnumerable<Zone> Zones
    {
        get
        {
            if (_zones is null)
                lock (_lock)
                    if (_zones is null)
                        _zones = FetchZones();
            return _zones;
        }
    }

    public HAService(IHomeAssistantApi haApi, IDomainService<GpsHistory> gpsHistoryDS, IDomainService<GpsRoute> gpsRouteDS, IDomainService<Zone> zoneDS)
    {
        this.haApi = haApi;
        this.gpsHistoryDS = gpsHistoryDS;
        this.gpsRouteDS = gpsRouteDS;
        this.zoneDS = zoneDS;
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
        //gpsRouteDS.GetAll().ToList().ForEach(x => gpsRouteDS.Delete(x));
        var newGpsRoutes = BuildGpsRoutes(gpsHistoryItems);//todo - зачем каждый раз пытаться построить существующие маршруты?
        newGpsRoutes.Where(x => x.GpsPoints.All(y => y.GpsRoute == null))
            .ToList()
            .ForEach(x => gpsRouteDS.Save(x));

        IEnumerable<GpsRoute> routes = gpsRoutes.Concat(newGpsRoutes);
        SuggestRouteLocations(Zones, routes);

        return ConvertRoutesToDTO(routes);
    }

    private static void SuggestRouteLocations(IEnumerable<Zone> zones, IEnumerable<GpsRoute> routes)
    {
        foreach (var item in routes)
        {
            if (item.IsAproved) continue;
            if (item.Origin == "not_home")
            {
                var closest = zones.SingleOrDefault(x => x.IsIntersected(item.GetRoutePoints().First()));
                if (closest != null)
                {
                    item.SuggestedOrigin = closest.Name;
                }
            }
            else
            {
                var closest = zones.SingleOrDefault(x => x.IsIntersected(item.GetRoutePoints().First()));
                if (item.Origin == "home")
                    item.SuggestedOrigin = "Дом";
                else if (closest != null && closest.Name == item.Origin)
                {
                    item.SuggestedOrigin = closest.Name;
                }
            }

            if (item.Destination == "not_home")
            {
                var closest = zones.SingleOrDefault(x => x.IsIntersected(item.GetRoutePoints().Last()));
                if (closest != null)
                {
                    item.SuggestedDestination = closest.Name;
                }
            }
            else
            {
                var closest = zones.SingleOrDefault(x => x.IsIntersected(item.GetRoutePoints().Last()));
                if (item.Destination == "home")
                    item.SuggestedDestination = "Дом";
                else if (closest != null && closest.Name == item.Destination)
                {
                    item.SuggestedDestination = closest.Name;
                }
            }
        }
    }

    private IEnumerable<Zone> FetchZones()
    {
        List<Zone> localZones = zoneDS.GetAll().ToList();
        var zones = haApi.GetZones();
        var curZones = zones.Select(x => new Zone(x));
        var createdZones = curZones
            .ExceptBy(localZones.Select(x => x.EntityId), x => x.EntityId)
            .ToList()
            .Select(x => { x.HASynced = true; return x; })
            .Select(zoneDS.Save)
            .ToList();

        var deletedZones = localZones
            .ExceptBy(curZones.Select(x => x.EntityId), x => x.EntityId)
            .ToList()
            .Select(x => { x.HASynced = false; return x; })
            .Select(zoneDS.Save)
            .ToList();

        var sameZonesId = localZones.Select(x => x.EntityId).Intersect(curZones.Select(x => x.EntityId)).ToList();
        var updatedZones = localZones.Where(x => sameZonesId.Contains(x.EntityId))
            .Select(x =>
            {
                var newVer = curZones.FirstOrDefault(y => y.EntityId == x.EntityId);
                newVer.Id = x.Id;
                newVer.HASynced = true;
                return newVer;
            })
            .Select(zoneDS.Save)
            .ToList();

        return zoneDS.GetAll().ToList();
    }

    /// <summary>
    /// Сохранает новую локацию
    /// </summary>
    /// <param name="gpsHistoryItems"></param>
    /// <param name="entityHistoryItems"></param>
    private void ArchiveNewGpsHistory(List<GpsHistory> gpsHistoryItems, List<DTOEntityHistoryItem> entityHistoryItems)
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
        .Where(x => x.GpsStamp > startFrom)
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
    private List<DTOEntityHistoryItem> PullNewGpsPoints(DateTime? startFrom) => haApi.GetLocationHistory(startFrom);

    /// <summary>
    /// Удаляет повторяющиеся точки присутствия в известных местах
    /// </summary>
    /// <param name="lastPoint"></param>
    /// <param name="historyItems"></param>
    private void FilterStaingPoints(GpsHistory? lastPoint, List<DTOEntityHistoryItem> historyItems)
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
    private List<DTOEntityHistoryItem> FilterActualPoints(DateTime? startStamp, List<DTOEntityHistoryItem> historyItems)
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

    /// <param name="asOriginPoint"></param>
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
        Coordinates = route.GetRoutePoints()
            .Select(p => new List<double> { p.Latitude, p.Longitude })
            .ToList()
    }).ToList();

    public static double Dist(DTOEntityHistoryItem a, DTOEntityHistoryItem b)
    {
        return Math.Sqrt(Math.Pow(a.Attributes.Latitude - b.Attributes.Latitude, 2) + Math.Pow(a.Attributes.Longitude - b.Attributes.Longitude, 2));
    }

    public static double Dist(GpsHistory a, GpsHistory b)
    {
        return Math.Sqrt(Math.Pow(a.Latitude - b.Latitude, 2) + Math.Pow(a.Longitude - b.Longitude, 2));
    }

    public static double Dist(List<double> a, List<double> b)
    {
        return Math.Sqrt(Math.Pow(a[1] - b[1], 2) + Math.Pow(a[0] - b[0], 2));
    }

    public object AproveRoute(Guid id, string origin, string destination)
    {
        var route = gpsRouteDS.Get(id);
        route.Origin = origin;
        route.Destination = destination;
        route.IsAproved = true;
        gpsRouteDS.Save(route);
        return true;
    }

    public object GetNewRoutes()
    {
        var routes = gpsRouteDS.GetAll().Where(x => !x.IsAproved).ToList();
        SuggestRouteLocations(Zones, routes);
        return routes.Select(x =>
        {
            return new
            {
                x.Id,
                Start = x.Start,
                End = x.End,
                Duration = $"{x.Duration.TotalMinutes.Round()} мин.",
                Points = x.GpsPoints.Count,
                Origin = x.SuggestedOrigin == null ? x.Origin : "",
                Destination = x.SuggestedDestination == null ? x.Destination : "",
                SuggestedOrigin = x.SuggestedOrigin,
                SuggestedDestination = x.SuggestedDestination,
                Coordinates = x.GetRoutePoints()
                    .Select(p => new List<double> { p.Latitude, p.Longitude })
                    .ToList()
            };
        }).ToArray();
    }
}