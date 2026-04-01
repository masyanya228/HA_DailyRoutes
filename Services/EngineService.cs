using DDDHibernate.DomainServices.DomainStructure;

using HA_DailyRoutes.APIs;
using HA_DailyRoutes.Entities;

namespace HA_DailyRoutes.Services
{
    public class EngineService
    {
        private readonly IHomeAssistantApi haApi;
        private readonly IDomainService<EngineHistory> engineHistoryDS;
        public EngineService(IHomeAssistantApi haApi, IDomainService<EngineHistory> engineHistoryDS)
        {
            this.haApi = haApi;
            this.engineHistoryDS = engineHistoryDS;
        }

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
    }
}
