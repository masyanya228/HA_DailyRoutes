using Newtonsoft.Json;

namespace HAOS_sensor_test
{
    public class Geometry
    {
        [JsonProperty("type")]
        public string Type { get; set; }

        [JsonProperty("coordinates")]
        public List<List<double>> Coordinates { get; set; } = new List<List<double>>();
    }

    public class Props
    {
        [JsonProperty("description")]
        public string Description { get; set; }

        [JsonProperty("stroke")]
        public string Stroke { get; set; }

        [JsonProperty("stroke-width")]
        public int StrokeWidth { get; set; }

        [JsonProperty("stroke-opacity")]
        public double StrokeOpacity { get; set; }
    }

    public class Root
    {
        [JsonProperty("type")]
        public string Type { get; set; } = "FeatureCollection";

        [JsonProperty("features")]
        public List<DTOYandex> Features { get; set; } = new List<DTOYandex>();
    }

    public class DTOYandex
    {
        [JsonProperty("type")]
        public string Type { get; set; }

        [JsonProperty("id")]
        public int Id { get; set; }

        [JsonProperty("geometry")]
        public Geometry Geometry { get; set; } = new Geometry();

        [JsonProperty("properties")]
        public Props Properties { get; set; } = new Props();
    }
}
