using Antlr.Runtime;

using DDDHibernate.DI;
using DDDHibernate.DomainServices.DomainStructure;
using DDDHibernate.Repositories.Implementations;
using DDDHibernate.Repositories.RepositoryStructure;
using DDDHibernate.Xtensions;

using HA_DailyRoutes.APIs;
using HA_DailyRoutes.Entities;
using HA_DailyRoutes.Repositories;
using HA_DailyRoutes.Services;

using Microsoft.Win32;

internal class Program
{
    private static void Main(string[] args)
    {
        const string AppName = "HA_DailyRoutes";
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            Args = args,
            ContentRootPath = AppContext.BaseDirectory, // или укажи путь явно
            WebRootPath = Path.Combine(AppContext.BaseDirectory, "wwwroot")
        });

        RegistryKey rk = Registry.CurrentUser.OpenSubKey("SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run", true);
        rk.SetValue(AppName, Path.Combine(builder.Environment.ContentRootPath, "HA_DailyRoutes.exe"));
        //rk.DeleteValue(AppName, false);

        builder.Services.AddDDDHibernate(builder.Configuration);

        builder.Services.AddControllersWithViews();
        builder.Services.AddResponseCaching();

        builder.Services.AddSingleton(typeof(HAService));
        builder.Services.AddSingleton(typeof(GuessZoneService));
        builder.Services.AddSingleton(typeof(IHomeAssistantApi), typeof(HomeAssistantApi));
        builder.Services.AddSingleton(typeof(IRepository<GpsRoute>), typeof(PGDeletableRepository<GpsRoute>));
        builder.Services.AddKeyedSingleton(typeof(IRepository<GpsRoute>), "ServiceDelete", typeof(GpsRouteRepository));

        builder.Services.AddHttpClient("HA", client =>
        {
            client.BaseAddress = new Uri("http://192.168.0.102:8123");
            client.DefaultRequestHeaders.Add("Authorization", "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiIwOWE0MzY5ZmU1ZjA0MjVjOTBiNTEzMTZmZTYyYWI4MyIsImlhdCI6MTc3MTE4MzQ4MSwiZXhwIjoyMDg2NTQzNDgxfQ.vfnT2s-EqI2axMNbKAfRj1lrhv3yQdbEmIYfDYKX3HE");
        });

        var app = builder.Build();

        app.UseDDDHibernate();

        if (!app.Environment.IsDevelopment())
        {
            app.UseExceptionHandler("/Home/Error");
            // The default HSTS value is 30 days. You may want to change this for production scenarios, see https://aka.ms/aspnetcore-hsts.
            app.UseHsts();
        }

        app.UseStaticFiles();
        app.UseResponseCaching();
        app.UseRouting();
        app.UseAuthorization();

        app.MapControllerRoute(
            name: "default",
            pattern: "{controller=Home}/{action=Index}/{id?}");

        app.Lifetime.ApplicationStarted.Register(OnStarted);
        app.Run();
    }

    public static void OnStarted()
    {
        var zoneDS = Container.GetDomainService<Zone>();
        var routeDS = Container.GetDomainService<GpsRoute>();
        var allZones = routeDS.GetAll().ToList().SelectMany(x => new Zone[] {
            new()
            {
                Latitude = x.AllPoints.First().Latitude,
                Longitude = x.AllPoints.First().Longitude,
                Name = x.Origin,
                TimeStamp = x.Start,
            },
            new()
            {
                Latitude = x.AllPoints.Last().Latitude,
                Longitude = x.AllPoints.Last().Longitude,
                Name = x.Destination,
                TimeStamp = x.End,
            }
        });
//        var ServiceDeleteGpsRoute = Container.GetRepository<GpsRoute>("ServiceDelete");
//        var guids = @"52a9751f-4e6c-4822-b8bb-78984a0f9eb1
//64718bc1-505f-4d9d-bfce-b38aa72e5b53
//61c7897b-3909-45b7-807f-98c047c97afe
//6c05e73d-c0da-4c73-b60b-672aee105ede
//107dc9bc-f62d-4acb-8f18-c85670cdcabb".Split("\r\n");
//        foreach (var item in guids)
//        {
//            ServiceDeleteGpsRoute.Delete(Guid.Parse(item));
//        }
    }
}