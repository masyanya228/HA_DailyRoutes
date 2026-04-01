using DDDHibernate.DomainServices.DomainStructure;
using DDDHibernate.Xtensions;

using HA_DailyRoutes.APIs;
using HA_DailyRoutes.Entities;
using HA_DailyRoutes.Models.DTOs;

namespace HA_DailyRoutes.Services
{
    public class GuessZoneService
    {
        private readonly IDomainService<GpsRoute> gpsRouteDS;
        private readonly IDomainService<GpsHistory> gpsHistoryDS;
        private readonly IDomainService<EngineHistory> engineHistoryDS;
        private readonly IDomainService<Zone> zoneDS;
        private readonly IHomeAssistantApi haApi;
        private readonly ICalendar calendar;
        private readonly EngineService engineService;


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

        public GuessZoneService(IDomainService<GpsRoute> gpsRouteDS, IHomeAssistantApi haApi, IDomainService<Zone> zoneDS, IDomainService<GpsHistory> gpsHistoryDS, ICalendar calendar, IDomainService<EngineHistory> engineHistoryDS, EngineService engineService)
        {
            this.gpsRouteDS = gpsRouteDS;
            this.haApi = haApi;
            this.zoneDS = zoneDS;
            this.gpsHistoryDS = gpsHistoryDS;
            this.calendar = calendar;
            this.engineHistoryDS = engineHistoryDS;
            this.engineService = engineService;
        }

        [Obsolete($"Используйте метод {nameof(GetNextRoute)}", true)]
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
                    Coordinates = x.AllPoints
                        .Select(p => new List<double> { p.Latitude, p.Longitude })
                        .ToList()
                };
            }).ToArray();
        }

        /// <summary>
        /// Возвращает следующий маршрут для уточнения
        /// </summary>
        /// <param name="id"></param>
        /// <returns></returns>
        public object GetNextRoute(Guid id = default)
        {
            var gpsRoutes = gpsRouteDS.GetAll().Where(x => !x.IsAproved).OrderBy(x => x.Start).ToList();
            var route = id == default
                ? gpsRoutes.FirstOrDefault()
                : gpsRoutes.FirstOrDefault(x => x.Id == id);
            if (route is null)
                return null;
            SupplementWithEngineData(route);
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
                    Coordinates = route.AllPoints
                        .Select(p => new object[] { p.Id, p.Latitude, p.Longitude })
                        .ToList(),
                    SuggestSplits = "new [0]"
                },
                AllIds = gpsRoutes.Select(x => x.Id).ToList(),
            };
        }

        public IEnumerable<SuggestRouteSplit> SupplementWithEngineData(GpsRoute route)
        {
            engineService.GetCleanEngineStates();
            var engineStates = engineHistoryDS.GetAll().ToArray();
            var engineRoute = new EngineRouteDTO();
            var startState = engineStates
                .Where(x => x.State == EngineStates.On || x.State == EngineStates.OnAuto)
                .MinBy(x => Math.Abs((x.Updated - route.Start).TotalMinutes));

            var endState = engineStates
                .Where(x => x.State == EngineStates.Off)
                .MinBy(x => Math.Abs((x.Updated - route.End).TotalMinutes));

            if (startState == null || endState == null)
                return null;

            engineRoute.EngineHistories = engineStates.SkipWhile(x => x.Id != startState.Id).TakeWhile(x => x.Id != endState.Id).Prepend(endState).OrderBy(x => x.Updated).ToList();
            var startEnd = SuggestStartEnd(route, engineRoute);
            var splits = SuggestSplits(route, engineRoute);
            Console.WriteLine($"{route.Start:g}-{route.End:g} {route.Origin}->{route.Destination}");
            if (startEnd != default)
            {
                route.Start = startEnd.Start;
                route.End = startEnd.End;
                Console.WriteLine($"StartEnd:\r\n{route.Start:t}-{route.End:t}");
            }
            if (splits.Any())
            {
                foreach (var split in splits)
                {
                    Console.WriteLine($"Split:\r\n{split.PrevEnd:g}-{split.NextStart:g} {split.SplitePoint.State} {split.SplitePoint.GpsStamp:g} ({split.MidStamp:g})");
                }
            }
            return null;
        }

        private SuggestRouteStartEnd SuggestStartEnd(GpsRoute route, EngineRouteDTO engineRoute)
        {
            if (engineRoute is null)
                return null;
            var result = new SuggestRouteStartEnd();
            if (engineRoute.EngineHistories.FirstOrDefault()?.State == EngineStates.On)
                result.Start = engineRoute.Start!.Value;
            
            result.End = engineRoute.End!.Value;
            return result;
        }

        private IEnumerable<SuggestRouteSplit> SuggestSplits(GpsRoute route, EngineRouteDTO engineRoute)
        {
            var routeSplits = new List<SuggestRouteSplit>();
            var curRouteSplit = new SuggestRouteSplit();
            var midPoints = engineRoute.EngineHistories.ToArray()[1..^1];
            foreach (var midPoint in midPoints)
            {
                if (midPoint.State == EngineStates.Off)
                    curRouteSplit.PrevEnd = midPoint.Updated;
                if (curRouteSplit.PrevEnd != default && midPoint.State == EngineStates.On)
                {
                    curRouteSplit.NextStart = midPoint.Updated;
                    curRouteSplit.SplitePoint = route.AllPoints
                        .Where(x => x.GpsStamp.Between(curRouteSplit.PrevEnd, curRouteSplit.NextStart))
                        .OrderBy(x => Math.Abs((x.GpsStamp - curRouteSplit.MidStamp).TotalMinutes))
                        .FirstOrDefault()!;

                    if (curRouteSplit.IsCompleted)
                        routeSplits.Add(curRouteSplit);
                    else
                        curRouteSplit = new SuggestRouteSplit();
                }
            }
            return routeSplits;
        }

        /// <summary>
        /// Уточняет маршрут
        /// </summary>
        /// <param name="id"></param>
        /// <param name="origin"></param>
        /// <param name="destination"></param>
        /// <param name="splitPointId"></param>
        /// <param name="deletedPointIds"></param>
        /// <param name="movedPoints"></param>
        /// <returns></returns>
        public object AproveRoute(Guid id, string origin, string destination, Guid splitPointId, List<Guid> deletedPointIds, List<MovedPointDTO> movedPoints)
        {
            var route = gpsRouteDS.Get(id);
            var routePoints = route.GpsPoints.OrderBy(x => x.GpsStamp).ToArray();
            if (route is null || route.IsAproved)
                return false;

            foreach (var pointId in deletedPointIds)
            {
                GpsHistory point = gpsHistoryDS.Get(pointId);
                point.GpsRoute = null;
                gpsHistoryDS.Save(point);
            }

            foreach (var movedPoint in movedPoints)
            {
                GpsHistory point = gpsHistoryDS.Get(movedPoint.Id);
                point.Latitude = movedPoint.Lat;
                point.Longitude = movedPoint.Lng;
                gpsHistoryDS.Save(point);
            }

            var newRoute = new GpsRoute();
            if (splitPointId != default)
            {
                newRoute = gpsRouteDS.Save(newRoute);
                bool startDelete = false;
                foreach (var point in routePoints)
                {
                    if (point.Id == splitPointId)
                    {
                        startDelete = true;
                        newRoute.AsOriginPoint = point;
                        continue;
                    }
                    if (startDelete)
                    {
                        point.GpsRoute = newRoute;
                        newRoute.GpsPoints.Add(point);
                    }
                }
                newRoute.Start = newRoute.GpsPoints.First().GpsStamp;
                newRoute.End = newRoute.GpsPoints.Last().GpsStamp;
                newRoute.Origin = destination;
                gpsRouteDS.Save(newRoute);
                route.End = newRoute.Start;
            }

            route.Origin = origin;
            route.Destination = destination;
            route.IsAproved = true;
            gpsRouteDS.Save(route);

            Task.Run(() =>
            {
                var calendarEventId = calendar.CreateRouteEvent(route);
                route.CalendarEventId = calendarEventId;
                gpsRouteDS.Save(route);
            });
            return splitPointId != default
                ? new { newRouteId = newRoute.Id }
                : null!;
        }

        /// <summary>
        /// Скрывает маршрут с карты
        /// </summary>
        /// <param name="id"></param>
        /// <returns></returns>
        public object? DeleteRoute(Guid id)
        {
            return gpsRouteDS.Delete(id);
        }

        /// <summary>
        /// Возвращает массив точек всех зон с весом.
        /// Чем лучше точность, тем больше вес.
        /// </summary>
        /// <returns></returns>
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

        /// <summary>
        /// Подбирает наиболее вероятную зону для начала и конца маршрута
        /// </summary>
        /// <param name="route"></param>
        private void GuessRoute(GpsRoute route)
        {
            GuessRoutes([route]);
        }

        /// <summary>
        /// Подбирает наиболее вероятную зону для начала и конца маршрутов
        /// </summary>
        /// <param name="routes"></param>
        private void GuessRoutes(IEnumerable<GpsRoute> routes)
        {
            foreach (var item in routes)
            {
                if (item.Origin == "home")
                    item.SuggestedOrigin = "Дом";
                else
                    item.SuggestedOrigin = GuessZone(item.AllPoints.First())?.Name;

                if (item.Destination == "home")
                    item.SuggestedDestination = "Дом";
                else
                    item.SuggestedDestination = GuessZone(item.AllPoints.Last())?.Name;
            }
        }

        /// <summary>
        /// Определяет наиболее подходящую зону для GPS точки.
        /// Радиус поиска и вес исторических точек учитывают точность координат
        /// с коэффициентом неопределённости 2.5.
        /// </summary>
        private ZoneWithGpsHistoryDTO? GuessZone(GpsHistory current)
        {
            const double uncertaintyCoef = 2.5;
            const double currentRadiusBoost = 300;

            var scores = new Dictionary<ZoneWithGpsHistoryDTO, double>();

            foreach (var zone in ZoneWithGpsHistoryDTOs)
            {
                scores.Add(zone, 0);
                foreach (var point in zone.HistoryPoints)
                {
                    var currentRadius = (current.GetRadius() + currentRadiusBoost) + point.GetRadius() * uncertaintyCoef;
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

        /// <summary>
        /// Обновляет информацию о зонах из HA
        /// </summary>
        /// <returns></returns>
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
        /// Собирает массив зон и их исторических точек
        /// </summary>
        /// <returns></returns>
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
    }
}
