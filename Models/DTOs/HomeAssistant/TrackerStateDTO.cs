using Newtonsoft.Json;

namespace HA_DailyRoutes.Models.DTOs.HomeAssistant
{
    public class TrackerStateDTO : EntityStateDTO
    {

        [JsonProperty("attributes")]
        public TrackerAttributesDTO Attributes { get; set; }
    }

    public class TrackerAttributesDTO
    {
        [JsonProperty("source_type")]
        public string SourceType { get; set; }

        [JsonProperty("latitude")]
        public double Latitude { get; set; }

        [JsonProperty("longitude")]
        public double Longitude { get; set; }

        [JsonProperty("gps_accuracy")]
        public int GpsAccuracy { get; set; }

        [JsonProperty("friendly_name")]
        public string FriendlyName { get; set; }
    }
}
