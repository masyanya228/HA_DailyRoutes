using DDDHibernate.Models.Entities;

namespace HA_DailyRoutes.Entities
{
    public class SuggestRouteStartEnd : EntityBase
    {
        public virtual GpsRoute Route { get; set; }
        public virtual DateTime OriginalStart { get; set; }
        public virtual DateTime OriginalEnd { get; set; }
        public virtual DateTime SuggestedStart { get; set; }
        public virtual DateTime SuggestedEnd { get; set; }
        public virtual bool IsAproved { get; set; } = true;
    }
}
