using Newtonsoft.Json;

namespace HA_DailyRoutes.Models.DTOs.HomeAssistant
{
    public class ZoneDTO
    {
        [JsonProperty("name")]
        public string Name { get; set; }

        [JsonProperty("entity_id")]
        public string EntityId { get; set; }

        [JsonProperty("latitude")]
        public double Latitude { get; set; }

        [JsonProperty("longitude")]
        public double Longitude { get; set; }

        [JsonProperty("radius")]
        public double Radius { get; set; }
    }
}
