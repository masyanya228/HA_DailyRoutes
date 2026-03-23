using DDDHibernate.Models.Entities;

using System.Security.Policy;

namespace HA_DailyRoutes.Entities
{
    public class GpsRoute : NamedEntity
    {
        public virtual string Origin { get; set; }

        public virtual string Destination { get; set; }

        public virtual DateTime Start { get; set; }

        public virtual DateTime End { get; set; }

        public virtual TimeSpan Duration { get => End - Start; }

        public virtual bool IsAproved { get; set; } = false;

        /// <summary>
        /// Точки маршрута
        /// </summary>
        public virtual IList<GpsHistory> GpsPoints { get; set; } = new List<GpsHistory>();

        /// <summary>
        /// Используется в качестве отправной точки (state and location)
        /// </summary>
        public virtual GpsHistory AsOriginPoint { get; set; }

        public virtual string? SuggestedOrigin { get; set; } = null;
        public virtual string? SuggestedDestination { get; set; } = null;


        private IEnumerable<GpsHistory> _points;
        private readonly object _lock = new();

        /// <summary>
        /// Все точки маршрута
        /// </summary>
        public virtual IEnumerable<GpsHistory> AllPoints
        {
            get
            {
                if (_points is null)
                    lock (_lock)
                        if (_points is null)
                            _points = GetRoutePoints();
                return _points;
            }
        }

        public virtual IEnumerable<GpsHistory> GetRoutePoints()
        {
            return AsOriginPoint != null
                ? GpsPoints.Prepend(AsOriginPoint).OrderBy(x => x.GpsStamp)
                : GpsPoints.OrderBy(x => x.GpsStamp);
        }
    }
}
