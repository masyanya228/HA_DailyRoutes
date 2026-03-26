using HA_DailyRoutes.Entities;

namespace HA_DailyRoutes.Maps
{
    public class GpsRouteMap : NHSubclassClassMap<GpsRoute>
    {
        public GpsRouteMap()
        {
            Map(x => x.Start).Column("StartAt").Index("idx_gpsroutes_startat");
            Map(x => x.End).Column("EndAt").Index("idx_gpsroutes_endat");
            Map(x => x.Origin);
            Map(x => x.Destination);
            Map(x => x.IsAproved);
            Map(x => x.IsDeleted);
            Map(x => x.DeletedStamp);
            HasMany(x => x.GpsPoints)
                .Cascade.None()
                .Not.LazyLoad();
            References(x => x.AsOriginPoint)
                .Not.LazyLoad();
        }
    }
}
