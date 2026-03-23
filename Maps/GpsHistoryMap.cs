using HA_DailyRoutes.Entities;

namespace HA_DailyRoutes.Maps
{
    public class GpsHistoryMap : NHSubclassClassMap<GpsHistory>
    {
        public GpsHistoryMap()
        {
            Map(x => x.GpsAccuracy);
            Map(x => x.Latitude);
            Map(x => x.Longitude);
            Map(x => x.GpsStamp);
            Map(x => x.State);
            References(x => x.GpsRoute);
        }
    }
}
