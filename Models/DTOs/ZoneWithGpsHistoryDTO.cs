using HA_DailyRoutes.Entities;

namespace HA_DailyRoutes.Models.DTOs
{
    public class ZoneWithGpsHistoryDTO
    {
        public string Name { get; set; }
        public IEnumerable<Zone> Zones { get; set; }

        public ZoneWithGpsHistoryDTO(IEnumerable<Zone> zones)
        {
            Zones = zones;
            Name = zones.First().Name;
        }

        public IEnumerable<GpsHistory> HistoryPoints
        {
            get
            {
                return Zones.Select(x => new GpsHistory()
                {
                    Latitude = x.Latitude,
                    Longitude = x.Longitude,
                    State = x.Name,
                    GpsAccuracy = (int)x.GetRadius(),
                });
            }
        }

        public (double, double) Location
        {
            get
            {
                var HAsyncedZone = Zones.FirstOrDefault(x => x.HASynced);
                if (HAsyncedZone is not null)
                {
                    return (HAsyncedZone.Latitude, HAsyncedZone.Longitude);
                }
                return (Zones.Average(x => x.Latitude), Zones.Average(x => x.Longitude));
            }
        }
    }
}
