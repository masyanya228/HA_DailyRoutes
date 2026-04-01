using HA_DailyRoutes.Entities;

namespace HA_DailyRoutes.Services
{
    public interface ISupplementRoute
    {
        /// <summary>
        /// Обогощает маршрут
        /// </summary>
        /// <param name="route"></param>
        void SupplementRoute(GpsRoute route);
    }
}