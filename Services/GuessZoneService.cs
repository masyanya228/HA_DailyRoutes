using DDDHibernate.DomainServices.DomainStructure;
using DDDHibernate.Xtensions;

using HA_DailyRoutes.APIs;
using HA_DailyRoutes.Entities;
using HA_DailyRoutes.Models.DTOs;

using System.Linq;

namespace HA_DailyRoutes.Services
{
    public class GuessZoneService
    {
        private readonly IDomainService<GpsRoute> gpsRouteDS;
        private readonly IDomainService<Zone> zoneDS;
        private readonly IHomeAssistantApi haApi;


        private IEnumerable<Zone> _zones;
        private readonly object _lock = new();

        public IEnumerable<Zone> Zones
        {
            get
            {
                if (_zones is null)
                    lock (_lock)
                        if (_zones is null)
                            _zones = FetchZones();
                return _zones;
            }
        }

        private IEnumerable<ZoneWithGpsHistoryDTO> _zoneWithGpsHistoryDTOs;
        private readonly object _lockZWGHD = new();

        public IEnumerable<ZoneWithGpsHistoryDTO> ZoneWithGpsHistoryDTOs
        {
            get
            {
                if (_zoneWithGpsHistoryDTOs is null)
                    lock (_lockZWGHD)
                        if (_zoneWithGpsHistoryDTOs is null)
                            _zoneWithGpsHistoryDTOs = GetZonesWithGpsHistory();
                return _zoneWithGpsHistoryDTOs;
            }
        }

        public GuessZoneService(IDomainService<GpsRoute> gpsRouteDS, IHomeAssistantApi haApi, IDomainService<Zone> zoneDS)
        {
            this.gpsRouteDS = gpsRouteDS;
            this.haApi = haApi;
            this.zoneDS = zoneDS;
        }

        public object GetNewRoutes()
        {
            var routes = gpsRouteDS.GetAll().Where(x => !x.IsAproved).ToList();
            GuessRoutes(routes);
            return routes.Select(x =>
            {
                return new
                {
                    x.Id,
                    Start = x.Start,
                    End = x.End,
                    Duration = $"{x.Duration.TotalMinutes.Round()} мин.",
                    Points = x.GpsPoints.Count,
                    Origin = x.SuggestedOrigin == null ? x.Origin : "",
                    Destination = x.SuggestedDestination == null ? x.Destination : "",
                    SuggestedOrigin = x.SuggestedOrigin,
                    SuggestedDestination = x.SuggestedDestination,
                    Coordinates = x.GetRoutePoints()
                        .Select(p => new List<double> { p.Latitude, p.Longitude })
                        .ToList()
                };
            }).ToArray();
        }

        public object GetNextRoute(Guid id = default)
        {
            var gpsRoutes = gpsRouteDS.GetAll().Where(x => !x.IsAproved).OrderBy(x => x.Start).ToList();
            var route = id == default
                ? gpsRoutes.FirstOrDefault()
                : gpsRoutes.FirstOrDefault(x => x.Id == id);
            if (route is null)
                return null;
            GuessRoute(route);
            return new
            {
                route = new
                {
                    route.Id,
                    Start = route.Start,
                    End = route.End,
                    Duration = $"{route.Duration.TotalMinutes.Round()} мин.",
                    Points = route.GpsPoints.Count,
                    Origin = route.SuggestedOrigin == null ? route.Origin : "",
                    Destination = route.SuggestedDestination == null ? route.Destination : "",
                    SuggestedOrigin = route.SuggestedOrigin,
                    SuggestedDestination = route.SuggestedDestination,
                    Coordinates = route.GetRoutePoints()
                        .Select(p => new object[]{ p.Id, p.Latitude, p.Longitude })
                        .ToList(),
                },
                AllIds = gpsRoutes.Select(x => x.Id).ToList(),
            };
        }

        private void GuessRoutes(IEnumerable<GpsRoute> routes)
        {
            foreach (var item in routes)
            {
                if (item.Origin == "home")
                    item.SuggestedOrigin = "Дом";
                else
                    item.SuggestedOrigin = GuessZone(item.GetRoutePoints().First())?.Name;

                if (item.Destination == "home")
                    item.SuggestedDestination = "Дом";
                else
                    item.SuggestedDestination = GuessZone(item.GetRoutePoints().Last())?.Name;
            }
        }

        private void GuessRoute(GpsRoute route)
        {
            GuessRoutes([route]);
        }

        private IEnumerable<Zone> FetchZones()
        {
            List<Zone> localZones = zoneDS.GetAll().ToList();
            var zones = haApi.GetZones();
            var curZones = zones.Select(x => new Zone(x));
            var createdZones = curZones
                .ExceptBy(localZones.Select(x => x.EntityId), x => x.EntityId)
                .ToList()
                .Select(x => { x.HASynced = true; return x; })
                .Select(zoneDS.Save)
                .ToList();

            var deletedZones = localZones
                .ExceptBy(curZones.Select(x => x.EntityId), x => x.EntityId)
                .ToList()
                .Select(x => { x.HASynced = false; return x; })
                .Select(zoneDS.Save)
                .ToList();

            var sameZonesId = localZones.Select(x => x.EntityId).Intersect(curZones.Select(x => x.EntityId)).ToList();
            var updatedZones = localZones.Where(x => sameZonesId.Contains(x.EntityId))
                .Select(x =>
                {
                    var newVer = curZones.FirstOrDefault(y => y.EntityId == x.EntityId);
                    newVer.Id = x.Id;
                    newVer.HASynced = true;
                    return newVer;
                })
                .Select(zoneDS.Save)
                .ToList();

            return zoneDS.GetAll().ToList();
        }

        /// <summary>
        /// Определяет наиболее подходящую зону по текущей GPS точке.
        /// Радиус поиска и вес исторических точек учитывают точность координат
        /// с коэффициентом неопределённости 2.5.
        /// </summary>
        private ZoneWithGpsHistoryDTO? GuessZone(GpsHistory current)
        {
            const double uncertaintyCoef = 2.5;

            var scores = new Dictionary<ZoneWithGpsHistoryDTO, double>();

            foreach (var zone in ZoneWithGpsHistoryDTOs)
            {
                scores.Add(zone, 0);
                foreach (var point in zone.HistoryPoints)
                {
                    var currentRadius = (current.GetRadius() + point.GetRadius()) * uncertaintyCoef;
                    var distance = point.GetDistance(current.Latitude, current.Longitude);
                    if (distance > currentRadius)
                        continue;
                    var accuracyWeight = 1.0 / point.GetRadius();
                    var distanceWeight = Math.Exp(-distance / currentRadius);
                    scores[zone] += accuracyWeight * distanceWeight;
                }
            }
            return scores.Any(x => x.Value > 0)
                ? scores.OrderByDescending(x => x.Value).First().Key
                : null;
        }

        private ZoneWithGpsHistoryDTO[] GetZonesWithGpsHistory()
        {
            return gpsRouteDS.GetAll()
                .Where(x => x.IsAproved)
                .ToList()
                .SelectMany(x => new Zone[] {
                    new()
                    {
                        Latitude = x.AllPoints.First().Latitude,
                        Longitude = x.AllPoints.First().Longitude,
                        Name = x.Origin,
                        TimeStamp = x.Start,
                        Radius = x.AllPoints.First().GetRadius(),
                    },
                    new()
                    {
                        Latitude = x.AllPoints.Last().Latitude,
                        Longitude = x.AllPoints.Last().Longitude,
                        Name = x.Destination,
                        TimeStamp = x.End,
                        Radius = x.AllPoints.Last().GetRadius(),
                    }
                })
                .Concat(Zones)
                .GroupBy(x => x.Name == "Home Assistant" ? "Дом" : x.Name)
                .Select(x => new ZoneWithGpsHistoryDTO(x.ToArray()))
                .ToArray();
        }

        public object GetZonesPoints()
        {
            return ZoneWithGpsHistoryDTOs
                .SelectMany(p => p.HistoryPoints
                    .Select(x => new
                    {
                        lat = x.Latitude,
                        lng = x.Longitude,
                        weight = Math.Round(1.0 - (x.GetRadius() - 1.0) / 99.0, 3)
                    })
                    .Where(x => x.weight > 0)
                );
        }
    }
}
