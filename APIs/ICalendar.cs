using HA_DailyRoutes.Entities;

namespace HA_DailyRoutes.APIs
{
    public interface ICalendar
    {
        string CreateRouteEvent(GpsRoute route);
    }
}