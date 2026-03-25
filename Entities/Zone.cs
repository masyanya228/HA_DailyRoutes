using HA_DailyRoutes.Models.DTOs.HomeAssistant;

namespace HA_DailyRoutes.Entities
{
    public class Zone : LocationPoint
    {
        public Zone()
        {

        }

        public Zone(ZoneDTO zoneDTO)
        {
            EntityId = zoneDTO.EntityId;
            Latitude = zoneDTO.Latitude;
            Longitude = zoneDTO.Longitude;
            Radius = zoneDTO.Radius;
            Name = zoneDTO.Name;
        }

        public virtual string EntityId { get; set; }

        public virtual double Radius { get; set; }

        /// <summary>
        /// Эта зона есть в HA
        /// </summary>
        public virtual bool HASynced { get; set; }

        public override double GetRadius()
        {
            return Radius;
        }
    }
}
