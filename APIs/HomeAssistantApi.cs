using HA_DailyRoutes.Models.DTOs.HomeAssistant;

using Newtonsoft.Json;

using RestSharp;

using System.Text;

namespace HA_DailyRoutes.APIs
{
    public class HomeAssistantApi : IHomeAssistantApi
    {
        const string _HAURL = "http://192.168.0.102:8123";
        const string _token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiIwOWE0MzY5ZmU1ZjA0MjVjOTBiNTEzMTZmZTYyYWI4MyIsImlhdCI6MTc3MTE4MzQ4MSwiZXhwIjoyMDg2NTQzNDgxfQ.vfnT2s-EqI2axMNbKAfRj1lrhv3yQdbEmIYfDYKX3HE";
        public IHttpClientFactory Factory { get; }

        public HomeAssistantApi(IHttpClientFactory factory)
        {
            Factory = factory;
        }

        public List<TrackerStateDTO> GetLocationHistory(DateTime? startFrom)
        {
            var weekAgo = DateTime.Now.AddDays(-7);
            var startTime = startFrom > weekAgo ? startFrom.Value : weekAgo;
            var endTime = Uri.EscapeDataString($"{DateTime.Now:yyyy-MM-ddTHH:mm:sszzz}");
            string query = $"{_HAURL}/api/history/period/" +
                $"{startTime:yyyy-MM-ddTHH:mm:sszzz}" +
                $"?filter_entity_id=device_tracker.fake_tracker" +
                $"&end_time={endTime}";

            RestClient client = new RestClient(query);
            var request = new RestRequest()
                .AddHeader("Authorization", $"Bearer {_token}")
                .AddHeader("Content-Type", $"application/json");

            var resp = client.Get(request);
            return JsonConvert.DeserializeObject<List<List<TrackerStateDTO>>>(resp.Content)?.FirstOrDefault() ?? throw new NullReferenceException("HA вернул недостоверные данные");
        }

        public List<EngineStateDTO> GetStarlineEngineHistory(DateTime? startFrom)
        {
            var weekAgo = DateTime.Now.AddDays(-7);
            var startTime = startFrom > weekAgo ? startFrom.Value : weekAgo;
            var endTime = Uri.EscapeDataString($"{DateTime.Now:yyyy-MM-ddTHH:mm:sszzz}");
            string query = $"{_HAURL}/api/history/period/" +
                $"{startTime:yyyy-MM-ddTHH:mm:sszzz}" +
                $"?filter_entity_id=switch.ceed_engine" +
                $"&end_time={endTime}";

            RestClient client = new RestClient(query);
            var request = new RestRequest()
                .AddHeader("Authorization", $"Bearer {_token}")
                .AddHeader("Content-Type", $"application/json");

            var resp = client.Get(request);
            return JsonConvert.DeserializeObject<List<List<EngineStateDTO>>>(resp.Content)?.FirstOrDefault() ?? throw new NullReferenceException("HA вернул недостоверные данные");
        }

        public List<ZoneDTO> GetZones()
        {
            var client = Factory.CreateClient("HA");

            var template = """
{%- set result = namespace(zones=[]) %}
{%- for z in states | selectattr('domain', 'eq', 'zone') %}
  {%- set result.zones = result.zones + [{
    'name':      z.name,
    'entity_id': z.entity_id,
    'latitude':  z.attributes.latitude,
    'longitude': z.attributes.longitude,
    'radius':    z.attributes.radius
  }] %}
{%- endfor %}
{{ result.zones | tojson }}
""";
            var body = new StringContent(
                JsonConvert.SerializeObject(new { template }),
                Encoding.UTF8, "application/json"
            );

            var response = client.PostAsync("/api/template", body).GetAwaiter().GetResult();
            var rawJson = response.Content.ReadAsStringAsync().GetAwaiter().GetResult();
            return JsonConvert.DeserializeObject<List<ZoneDTO>>(rawJson)!;
        }
    }
}
