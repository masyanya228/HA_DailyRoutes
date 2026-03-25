using DDDHibernate.Models.Entities;

namespace HA_DailyRoutes.Entities
{
    public abstract class LocationPoint : NamedEntity
    {
        public virtual double Latitude { get; set; }

        public virtual double Longitude { get; set; }

        public abstract double GetRadius();

        /// <summary>
        /// Возвращает дистанцию между 2 координатами в метрах
        /// </summary>
        /// <param name="lat1"></param>
        /// <param name="lon1"></param>
        /// <param name="lat"></param>
        /// <param name="lon"></param>
        /// <returns></returns>
        public virtual double GetDistance(double lat, double lon)
        {
            const double R = 6371000;

            var dLat = ToRad(lat - this.Latitude);
            var dLon = ToRad(lon - this.Longitude);

            var a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2) +
                    Math.Cos(ToRad(this.Latitude)) * Math.Cos(ToRad(lat)) *
                    Math.Sin(dLon / 2) * Math.Sin(dLon / 2);

            return R * 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));
        }

        public virtual double ToRad(double deg) => deg * Math.PI / 180;

        public virtual double DistanceTo(LocationPoint b)
            => GetDistance(b.Latitude, b.Longitude);

        public virtual bool IsIntersected(LocationPoint b)
            => DistanceTo(b) < (this.GetRadius() + b.GetRadius());

        public virtual bool IsOnMyRadius(LocationPoint b)
            => DistanceTo(b) < this.GetRadius();
    }
}
