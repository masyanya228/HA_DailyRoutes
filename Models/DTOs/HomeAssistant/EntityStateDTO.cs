using Newtonsoft.Json;

namespace HA_DailyRoutes.Models.DTOs.HomeAssistant
{
    public class EntityStateDTO
    {
        [JsonProperty("entity_id")]
        public string EntityId { get; set; }

        [JsonProperty("state")]
        public string State { get; set; }

        [JsonProperty("last_changed")]
        public DateTime LastChanged { get; set; }

        [JsonProperty("last_updated")]
        public DateTime LastUpdated { get; set; }
    }
}
