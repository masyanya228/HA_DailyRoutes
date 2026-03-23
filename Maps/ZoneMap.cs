using HA_DailyRoutes.Entities;

namespace HA_DailyRoutes.Maps
{
    public class ZoneMap : NHSubclassClassMap<Zone>
    {
        public ZoneMap()
        {
            Map(x => x.EntityId);
            Map(x => x.Latitude);
            Map(x => x.Longitude);
            Map(x => x.Radius);
            Map(x => x.HASynced);
        }
    }
}
