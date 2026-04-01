using HA_DailyRoutes.Models.DTOs.HomeAssistant;

namespace HA_DailyRoutes.APIs
{
    public interface IHomeAssistantApi
    {
        List<TrackerStateDTO> GetLocationHistory(DateTime? startFrom);
        List<EngineStateDTO> GetStarlineEngineHistory(DateTime? startFrom);
        List<ZoneDTO> GetZones();
    }
}