using HA_DailyRoutes.Entities;

namespace HA_DailyRoutes.Maps
{
    public class SuggestRouteStartEndMap : NHSubclassClassMap<SuggestRouteStartEnd>
    {
        public SuggestRouteStartEndMap()
        {
            Map(x => x.OriginalStart);
            Map(x => x.OriginalEnd);
            Map(x => x.SuggestedStart);
            Map(x => x.SuggestedEnd);
            Map(x => x.IsAproved);
            References(x => x.Route);
        }
    }
}
