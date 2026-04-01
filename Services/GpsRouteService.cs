using DDDHibernate.DI;
using DDDHibernate.DomainServices.DomainStructure;
using DDDHibernate.Repositories.RepositoryStructure;

using HA_DailyRoutes.Entities;
using HA_DailyRoutes.Models.DTOs;

namespace HA_DailyRoutes.Services
{
    public class GpsRouteService
    {
        private readonly HAService _haService;
        private readonly IRepository<GpsRoute> serviceDeleteGpsRoute;
        private readonly IDomainService<GpsRoute> gpsRouteDS;

        public GpsRouteService(HAService haService, IDomainService<GpsRoute> gpsRouteDS)
        {
            serviceDeleteGpsRoute = Container.GetRepository<GpsRoute>("ServiceDelete");
            _haService = haService;
            this.gpsRouteDS = gpsRouteDS;
        }

        /// <summary>
        /// Полностью удаляет маршруты, чтобы освободить GpsHistoty`s
        /// </summary>
        /// <param name="guidArrayArray"></param>
        public void BulkFullDelete(string guidArrayArray)
        {
            var guids = guidArrayArray.Split("\r\n");
            foreach (var item in guids)
            {
                serviceDeleteGpsRoute.Delete(Guid.Parse(item));
            }
        }

        /// <summary>
        /// Возвращает последние маршруты. В том числе неподтвержденные
        /// </summary>
        /// <param name="days"></param>
        /// <returns></returns>
        public IEnumerable<RouteDTO> GetRoutes(int days)
        {
            var startFrom = DateTime.Now.Date.AddDays(-days);
            var gpsRoutes = GetArchivedGpsRoutes(startFrom);
            List<GpsHistory> gpsHistoryItems = _haService.GetUnroutedHistory(startFrom, gpsRoutes);

            //Создание маршрутов
            FilterNearPoints(gpsHistoryItems);
            var newGpsRoutes = BuildGpsRoutes(gpsHistoryItems);
            newGpsRoutes.Where(x => x.GpsPoints.All(y => y.GpsRoute == null))
                .ToList()
                .ForEach(x => gpsRouteDS.Save(x));

            IEnumerable<GpsRoute> routes = gpsRoutes.Concat(newGpsRoutes);

            return ConvertRoutesToDTO(routes);
        }

        /// <summary>
        /// Удаляет точки с одинаковым состоянием, находящиеся слишком близко друг к другу
        /// </summary>
        /// <param name="gpsHistory"></param>
        private void FilterNearPoints(List<GpsHistory> gpsHistory)
        {
            for (int i = 1; i < gpsHistory.Count; i++)
            {
                if (gpsHistory[i].State == gpsHistory[i - 1].State && gpsHistory[i].DistanceTo(gpsHistory[i - 1]) < 50)
                {
                    gpsHistory.RemoveAt(i);
                    i--;
                    continue;
                }
            }
        }

        /// <summary>
        /// Возвращает ранее сохраненные маршруты
        /// </summary>
        /// <param name="startFrom"></param>
        /// <returns></returns>
        private List<GpsRoute> GetArchivedGpsRoutes(DateTime startFrom) => gpsRouteDS.GetAll()
            .Where(x => x.End > startFrom)
            .OrderBy(x => x.Start)
            .ToList();

        private List<GpsRoute> BuildGpsRoutes(List<GpsHistory> gpsHistory)
        {
            var routes = new List<GpsRoute>();
            if (gpsHistory.Count == 0) return routes;

            var currentPoints = new List<GpsHistory> { gpsHistory[0] };
            GpsHistory asOriginPoint = null;

            for (int i = 1; i < gpsHistory.Count; i++)
            {
                var gap = (gpsHistory[i].GpsStamp - gpsHistory[i - 1].GpsStamp).TotalMinutes;

                if (gap < 30)
                {
                    currentPoints.Add(gpsHistory[i]);
                }
                else
                {
                    if (currentPoints.Count > 1)
                        routes.Add(CreateGpsRoute(currentPoints, asOriginPoint));

                    currentPoints = new List<GpsHistory> { gpsHistory[i] };
                    asOriginPoint = gpsHistory[i - 1];
                }
            }

            if (currentPoints.Count > 1 && DateTime.Now.Subtract(currentPoints.Last().GpsStamp).TotalHours > 1)
                routes.Add(CreateGpsRoute(currentPoints, asOriginPoint));

            return routes.Where(x => x != null).ToList();
        }

        private GpsRoute CreateGpsRoute(List<GpsHistory> points, GpsHistory asOriginPoint)
        => points.All(x => x.GpsRoute is null)
            ? new GpsRoute
            {
                AsOriginPoint = asOriginPoint,
                Start = points.First().GpsStamp,
                End = points.Last().GpsStamp,
                Origin = (asOriginPoint ?? points.First()).State,
                Destination = points.Last().State,
                GpsPoints = points
            }
            : null;

        private List<RouteDTO> ConvertRoutesToDTO(IEnumerable<GpsRoute> routes) => routes.Select((route, index) => new RouteDTO
        {
            Id = index,
            Date = route.Start.ToString("yyyy-MM-dd"),
            Name = $"{route.Start:t} {route.Origin} -> {route.End:t} {route.Destination}",
            Color = $"#{new Random(index).Next(0x1000000):X6}",
            Coordinates = route.AllPoints
                .OrderBy(x => x.GpsStamp)
                .Select(p => new List<double> { p.Latitude, p.Longitude })
                .ToList()
        }).ToList();
    }
}
