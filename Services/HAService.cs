using DDDHibernate.DomainServices.DomainStructure;

using HA_DailyRoutes.APIs;
using HA_DailyRoutes.Entities;
using HA_DailyRoutes.Models.DTOs.HomeAssistant;

public class HAService
{
    private readonly IHomeAssistantApi haApi;
    private readonly IDomainService<GpsHistory> gpsHistoryDS;

    public HAService(IHomeAssistantApi haApi, IDomainService<GpsHistory> gpsHistoryDS)
    {
        this.haApi = haApi;
        this.gpsHistoryDS = gpsHistoryDS;
    }

    public List<GpsHistory> GetUnroutedHistory(DateTime startFrom, List<GpsRoute> gpsRoutes)
    {
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
        return gpsHistoryItems;
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
    /// Получить новые локации из HA
    /// </summary>
    /// <param name="startFrom"></param>
    /// <returns></returns>
    private List<TrackerStateDTO> PullNewGpsPoints(DateTime? startFrom) => haApi.GetLocationHistory(startFrom);

    /// <summary>
    /// Оставляет только GPS коориднаты начиная с определенного времени
    /// </summary>
    /// <param name="startStamp"></param>
    /// <param name="historyItems"></param>
    private List<TrackerStateDTO> FilterActualPoints(DateTime? startStamp, List<TrackerStateDTO> historyItems)
    => historyItems.Where(x => x.Attributes.SourceType == "gps")
        .Where(x => x.LastChanged > startStamp)
        .ToList();

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
}