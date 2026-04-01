using DDDHibernate.DomainServices.DomainStructure;
using DDDHibernate.Xtensions;

using HA_DailyRoutes.APIs;
using HA_DailyRoutes.Entities;
using HA_DailyRoutes.Models.DTOs;

namespace HA_DailyRoutes.Services
{
    public class EngineService : ISupplementRoute
    {
        private readonly IHomeAssistantApi haApi;
        private readonly IDomainService<EngineHistory> engineHistoryDS;
        private readonly IDomainService<SuggestRouteSplit> suggestRouteSplitDS;
        private readonly IDomainService<SuggestRouteStartEnd> suggestRouteStartEndDS;
        public EngineService(IHomeAssistantApi haApi, IDomainService<EngineHistory> engineHistoryDS, IDomainService<SuggestRouteSplit> suggestRouteSplitDS, IDomainService<SuggestRouteStartEnd> suggestRouteStartEndDS)
        {
            this.haApi = haApi;
            this.engineHistoryDS = engineHistoryDS;
            this.suggestRouteSplitDS = suggestRouteSplitDS;
            this.suggestRouteStartEndDS = suggestRouteStartEndDS;
        }

        public void SupplementRoute(GpsRoute route)
        {
            GetCleanEngineStates();
            var engineRoute = GetEngineRoute(route);
            if (engineRoute is null)
            {
                return;
            }
            route.SuggestStartEnd = SuggestStartEnd(route, engineRoute);
            route.SuggestSplits = SuggestSplits(route, engineRoute);
        }

        /// <summary>
        /// Возвращает новые состояния двигателя из HA
        /// </summary>
        /// <returns></returns>
        public IEnumerable<EngineHistory> GetCleanEngineStates()
        {
            var lastState = engineHistoryDS.GetAll().OrderByDescending(x => x.Updated).FirstOrDefault();
            var startFrom = lastState?.Updated ?? default;
            var newStates = haApi.GetStarlineEngineHistory(startFrom).Where(x => x.LastUpdated > startFrom).ToList();
            for (int i = 0; i < newStates.Count; i++)
            {
                if (newStates[i].State == "unavailable")
                {
                    newStates.RemoveAt(i);
                    i--;
                }
            }
            for (int i = 1; i < newStates.Count; i++)
            {
                if (newStates[i].State == newStates[i - 1].State)
                {
                    newStates.RemoveAt(i);
                    i--;
                }
            }
            return newStates
                .Select(x => engineHistoryDS.Save(new EngineHistory()
                {
                    Updated = x.LastUpdated,
                    State = x.State == "on"
                    ? (x.Attributes.Autostart ? EngineStates.OnAuto : EngineStates.On)
                    : (x.Attributes.Autostart ? EngineStates.OffAuto : EngineStates.Off)
                }))
                .OrderBy(x => x.Updated)
                .ToArray();
        }

        /// <summary>
        /// Возвращает состояния двигателя во время маршрута
        /// </summary>
        /// <param name="route"></param>
        /// <returns></returns>
        private EngineRouteDTO GetEngineRoute(GpsRoute route)
        {
            var engineRoute = new EngineRouteDTO();
            var engineStates = engineHistoryDS.GetAll().ToArray();
            var startState = engineStates
                .Where(x => x.State == EngineStates.On || x.State == EngineStates.OnAuto)
                .MinBy(x => Math.Abs((x.Updated - route.Start).TotalMinutes));

            var endState = engineStates
                .Where(x => x.State == EngineStates.Off)
                .MinBy(x => Math.Abs((x.Updated - route.End).TotalMinutes));

            if (startState == null || endState == null)
                return null;

            engineRoute.EngineHistories = engineStates.SkipWhile(x => x.Id != startState.Id).TakeWhile(x => x.Id != endState.Id).Prepend(endState).OrderBy(x => x.Updated).ToList();
            return engineRoute;
        }

        private SuggestRouteStartEnd SuggestStartEnd(GpsRoute route, EngineRouteDTO engineRoute)
        {
            if (engineRoute is null)
                return null;
            var result = new SuggestRouteStartEnd();
            result.OriginalStart = route.Start;
            result.OriginalEnd = route.End;

            if (engineRoute.EngineHistories.FirstOrDefault()?.State == EngineStates.On)
                result.SuggestedStart = engineRoute.Start!.Value;

            result.SuggestedEnd = engineRoute.End!.Value;
            return suggestRouteStartEndDS.Save(result);
        }

        private IEnumerable<SuggestRouteSplit> SuggestSplits(GpsRoute route, EngineRouteDTO engineRoute)
        {
            var oldSuggests = suggestRouteSplitDS.GetAll().Where(x => x.Route.Id == route.Id).ToArray();
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
                    curRouteSplit.Route = route;

                    if (curRouteSplit.IsCompleted && !oldSuggests.Any(x => x.SplitePoint == curRouteSplit.SplitePoint))
                        routeSplits.Add(curRouteSplit);
                    else
                        curRouteSplit = new SuggestRouteSplit();
                }
            }
            return oldSuggests.Concat(routeSplits.Select(suggestRouteSplitDS.Save));
        }
    }
}
