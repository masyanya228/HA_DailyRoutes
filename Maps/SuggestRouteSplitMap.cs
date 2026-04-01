using HA_DailyRoutes.Entities;

namespace HA_DailyRoutes.Maps
{
    public class SuggestRouteSplitMap : NHSubclassClassMap<SuggestRouteSplit>
    {
        public SuggestRouteSplitMap()
        {
            Map(x => x.PrevEnd);
            Map(x => x.NextStart);
            Map(x => x.IsAproved);
            References(x => x.SplitePoint);
            References(x => x.Route);
        }
    }
}
