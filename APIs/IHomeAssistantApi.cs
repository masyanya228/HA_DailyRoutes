using HA_DailyRoutes.Models.DTOs.HomeAssistant;

namespace HA_DailyRoutes.APIs
{
    public interface IHomeAssistantApi
    {
        List<DTOEntityHistoryItem> GetLocationHistory(DateTime? startFrom);
        List<ZoneDTO> GetZones();
    }
}