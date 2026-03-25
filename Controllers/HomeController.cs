using HA_DailyRoutes.Models;
using HA_DailyRoutes.Models.DTOs;
using HA_DailyRoutes.Services;

using Microsoft.AspNetCore.Mvc;

using System.Diagnostics;
using System.Text.Json;

namespace HA_DailyRoutes.Controllers
{
    public class HomeController : Controller
    {
        public readonly HAService HAService;
        public readonly GuessZoneService GuessZoneService;

        public HomeController(HAService hAService, GuessZoneService guessZoneService)
        {
            HAService = hAService;
            GuessZoneService = guessZoneService;
        }

        public IActionResult Index()
        {
            return View();
        }

        [ResponseCache(Duration = 60)]
        public IActionResult Routes(int days = 30)
        {
            return Json(HAService.GetHistory(days));
        }

        [HttpPost]
        public IActionResult AproveRoute([FromBody] JsonElement body)
        {
            var id = body.GetProperty("id").GetGuid();
            var origin = body.GetProperty("origin").GetString();
            var destination = body.GetProperty("destination").GetString();
            var deletedPointIds = body.GetProperty("deletedPointIds")
                .EnumerateArray()
                .Select(x => x.GetGuid())
                .ToList();

            var movedPoints = body.GetProperty("movedPoints")
                .EnumerateArray()
                .Select(x => new MovedPointDTO
                {
                    Id = x.GetProperty("id").GetGuid(),
                    Lat = x.GetProperty("lat").GetDouble(),
                    Lng = x.GetProperty("lng").GetDouble()
                })
                .ToList();
            return Json(HAService.AproveRoute(id, origin, destination, deletedPointIds, movedPoints));
        }

        public IActionResult GetNewRoutes()
        {
            return Json(GuessZoneService.GetNewRoutes());
        }

        public IActionResult GetNextRoute(Guid id=default)
        {
            return Json(GuessZoneService.GetNextRoute(id));
        }

        /// <summary>
        /// Возвращает GPS точки зон для тепловой карты
        /// </summary>
        public IActionResult HeatmapPoints()
        {
            return Json(GuessZoneService.GetZonesPoints());
        }

        public IActionResult Privacy()
        {
            return View();
        }

        [ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
        public IActionResult Error()
        {
            return View(new ErrorViewModel { RequestId = Activity.Current?.Id ?? HttpContext.TraceIdentifier });
        }
    }
}
