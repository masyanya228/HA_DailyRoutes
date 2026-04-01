using DDDHibernate.Models.Entities;

namespace HA_DailyRoutes.Entities
{
    public class SuggestRouteSplit : EntityBase
    {
        public virtual GpsRoute Route { get; set; }
        public virtual GpsHistory SplitePoint { get; set; }
        public virtual DateTime PrevEnd { get; set; }
        public virtual DateTime NextStart { get; set; }
        public virtual DateTime MidStamp
        {
            get
            {
                return PrevEnd + (NextStart - PrevEnd) / 2;
            }
        }
        public virtual bool IsCompleted { get => SplitePoint is not null && PrevEnd != default && NextStart != default; }
        public virtual bool IsAproved { get; set; }
    }
}
