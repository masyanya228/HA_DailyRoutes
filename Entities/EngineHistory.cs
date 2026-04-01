using DDDHibernate.Models.Entities;

namespace HA_DailyRoutes.Entities
{
    public class EngineHistory : EntityBase
    {
        public virtual EngineStates State { get; set; }
        public virtual DateTime Updated { get; set; }
    }
}
