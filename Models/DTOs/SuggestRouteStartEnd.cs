using HA_DailyRoutes.Entities;

namespace HA_DailyRoutes.Models.DTOs
{
    public class SuggestRouteStartEnd
    {
        public GpsRoute Route { get; set; }
        public DateTime Start { get; set; }
        public DateTime End { get; set; }
    }
}
