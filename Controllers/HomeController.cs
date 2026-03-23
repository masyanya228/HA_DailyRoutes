using HA_DailyRoutes.Models;

using Microsoft.AspNetCore.Mvc;

using System.Diagnostics;
using System.Text.Json;

namespace HA_DailyRoutes.Controllers
{
    public class HomeController : Controller
    {
        public HAService HAService { get; }

        public HomeController(HAService hAService)
        {
            HAService = hAService;
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
            return Json(HAService.AproveRoute(id, origin, destination));
        }

        public IActionResult GetNewRoutes()
        {
            return Json(HAService.GetNewRoutes());
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
