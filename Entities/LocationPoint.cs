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
        /// <param name="lat2"></param>
        /// <param name="lon2"></param>
        /// <returns></returns>
        public static double GetDistance(double lat1, double lon1, double lat2, double lon2)
        {
            const double R = 6371000;

            var dLat = ToRad(lat2 - lat1);
            var dLon = ToRad(lon2 - lon1);

            var a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2) +
                    Math.Cos(ToRad(lat1)) * Math.Cos(ToRad(lat2)) *
                    Math.Sin(dLon / 2) * Math.Sin(dLon / 2);

            return R * 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));
        }

        private static double ToRad(double deg) => deg * Math.PI / 180;

        public virtual double DistanceTo(LocationPoint b)
            => GetDistance(this.Latitude, this.Longitude, b.Latitude, b.Longitude);

        public virtual bool IsIntersected(LocationPoint b)
            => DistanceTo(b) < (this.GetRadius() + b.GetRadius());

        public virtual bool IsOnMyRadius(LocationPoint b)
            => DistanceTo(b) < this.GetRadius();
    }
}
