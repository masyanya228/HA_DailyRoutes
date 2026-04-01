using Newtonsoft.Json;

namespace HA_DailyRoutes.Models.DTOs.HomeAssistant
{
    public class EngineStateDTO : EntityStateDTO
    {

        [JsonProperty("attributes")]
        public EngineStateAttributesDTO Attributes { get; set; }
    }

    public class EngineStateAttributesDTO
    {
        [JsonProperty("autostart")]
        public bool Autostart { get; set; }

        [JsonProperty("ignition")]
        public bool Ignition { get; set; }

        [JsonProperty("assumed_state")]
        public bool AssumedState { get; set; }

        [JsonProperty("friendly_name")]
        public string FriendlyName { get; set; }
    }
}
