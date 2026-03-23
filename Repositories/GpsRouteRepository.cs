using DDDHibernate.Repositories.Implementations;

using HA_DailyRoutes.Entities;

using NHibernate;

using ISession = NHibernate.ISession;
namespace HA_DailyRoutes.Repositories
{
    public class GpsRouteRepository : PGRepository<GpsRoute>
    {
        public override bool Delete(GpsRoute route)
        {
            using ISession session = SessionFactory.OpenSession();
            using ITransaction transaction = session.BeginTransaction();
            try
            {
                var trackedRoute = session.Get<GpsRoute>(route.Id);
                var points = trackedRoute.GpsPoints.ToList();
                
                foreach (var point in trackedRoute.GpsPoints)
                    point.GpsRoute = null;
                trackedRoute.GpsPoints.Clear();

                session.Delete(trackedRoute);
                session.Flush();
                session.Evict(trackedRoute);
                foreach (var point in points)
                    session.Evict(point);
                session.Clear();
                transaction.Commit();
                return true;
            }
            catch (Exception ex)
            {
                transaction.Rollback();
                return false;
            }
        }
    }
}
