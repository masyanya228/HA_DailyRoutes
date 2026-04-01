using DDDHibernate.Xtensions;

using Google.Apis.Auth.OAuth2;
using Google.Apis.Calendar.v3;
using Google.Apis.Calendar.v3.Data;
using Google.Apis.Services;

using HA_DailyRoutes.Entities;

namespace HA_DailyRoutes.APIs
{
    public class GoogleCalendarAPI : ICalendar
    {
        public string CreateRouteEvent(GpsRoute route)
        {
            // Загружаем credentials из файла service account или OAuth
            var credential = GoogleCredential
                .FromFile("credentials.json")
                .CreateScoped(CalendarService.Scope.Calendar);

            var service = new CalendarService(new BaseClientService.Initializer
            {
                HttpClientInitializer = credential,
                ApplicationName = "HA Daily Routes"
            });

            var @event = new Event
            {
                Summary = $"Дорога {route.Origin} → {route.Destination}",
                Description = $@"{route.Start:t}-{route.End:t}
Маршрут записан автоматически.
Точек GPS: {route.GpsPoints.Count}",
                Start = new EventDateTime
                {
                    DateTimeDateTimeOffset = SimpifyStart(route.Start),
                    TimeZone = "Europe/Moscow"
                },
                End = new EventDateTime
                {
                    DateTimeDateTimeOffset = SimpifyEnd(route.Start, route.End),
                    TimeZone = "Europe/Moscow"
                }
            };

            var created = service
                .Events
                .Insert(@event, "marsel.khabibullin.99@gmail.com") // "primary" — основной календарь
                .Execute();

            return created.Id;
        }

        private DateTime SimpifyStart(DateTime timeS)
        {
            var simplified = (timeS.Minute / 15.0).Round() % 4 * 15;
            return timeS.Date.AddHours(timeS.Hour).AddMinutes(simplified);
        }

        private DateTime SimpifyEnd(DateTime timeS, DateTime timeE)
        {
            var simplifiedStart = SimpifyStart(timeS);
            var simplifiedDur = Math.Max(15, ((timeE - timeS).TotalMinutes / 15.0).Round() % 4 * 15);
            return simplifiedStart.AddMinutes(simplifiedDur);
        }
    }
}
