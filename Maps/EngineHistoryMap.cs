using HA_DailyRoutes.Entities;

namespace HA_DailyRoutes.Maps
{
    public class EngineHistoryMap : NHSubclassClassMap<EngineHistory>
    {
        public EngineHistoryMap()
        {
            Map(x => x.Updated);
            Map(x => x.State);
        }
    }
}
