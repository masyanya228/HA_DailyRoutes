namespace HA_DailyRoutes.Models.DTOs
{
    public class AproveRouteRequestDTO
    {
        public Guid Id { get; set; }
        public string Origin { get; set; }
        public string Destination { get; set; }
        public List<Guid> DeletedPointIds { get; set; } = new();
        public List<MovedPointDTO> MovedPoints { get; set; } = new();
    }
}
