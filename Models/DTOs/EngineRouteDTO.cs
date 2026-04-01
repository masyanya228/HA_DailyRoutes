using HA_DailyRoutes.Entities;

namespace HA_DailyRoutes.Models.DTOs
{
    /// <summary>
    /// Представление маршрута с точки зрения состояний двигателя
    /// </summary>
    public class EngineRouteDTO
    {
        public DateTime? Start { get { return EngineHistories.FirstOrDefault()?.Updated; } }
        public DateTime? End { get { return EngineHistories.LastOrDefault()?.Updated; } }
        public IEnumerable<EngineHistory> EngineHistories { get; set; } = new List<EngineHistory>();
    }
}
