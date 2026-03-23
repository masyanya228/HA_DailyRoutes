using DDDHibernate.Models.Entities;

namespace HA_DailyRoutes.Entities
{
    public class GpsHistory : LocationPoint
    {
        public virtual int GpsAccuracy { get; set; }

        /// <summary>
        /// Реальная отметка GPS координат
        /// </summary>
        public virtual DateTime GpsStamp { get; set; }

        public virtual string State {  get; set; }

        /// <summary>
        /// Принадлежность к маршруту
        /// </summary>
        public virtual GpsRoute GpsRoute { get; set; }

        public override double GetRadius()
        {
            return GpsAccuracy;
        }
    }
}
