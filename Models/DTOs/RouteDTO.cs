using Microsoft.AspNetCore.Mvc.Formatters;

using Newtonsoft.Json;

namespace HA_DailyRoutes.Models.DTOs
{
    public class RouteDTO
    {
        [JsonProperty("id")]
        public int Id { get; set; }

        [JsonProperty("date")]
        public string Date { get; set; }

        [JsonProperty("name")]
        public string Name { get; set; }

        [JsonProperty("color")]
        public string Color { get; set; }

        [JsonProperty("coordinates")]
        public List<List<double>> Coordinates { get; set; } = new List<List<double>>();
    }
}
