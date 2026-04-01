
    create table GpsHistorys (
        Id uuid default gen_random_uuid()  not null,
       TimeStamp timestamp,
       Name varchar(255),
       GpsAccuracy int4,
       Latitude float8,
       Longitude float8,
       primary key (Id)
    )
    alter table GpsHistorys 
        add column GpsStamp timestamp
    create table GpsHistorys (
        Id uuid default gen_random_uuid()  not null,
       TimeStamp timestamp,
       Name varchar(255),
       GpsAccuracy int4,
       Latitude float8,
       Longitude float8,
       GpsStamp timestamp,
       primary key (Id)
    )
    alter table GpsHistorys 
        add column State varchar(255)
    create table GpsHistorys (
        Id uuid default gen_random_uuid()  not null,
       TimeStamp timestamp,
       Name varchar(255),
       GpsAccuracy int4,
       Latitude float8,
       Longitude float8,
       GpsStamp timestamp,
       State varchar(255),
       primary key (Id)
    )
    alter table GpsHistorys 
        add column GpsRoute_id uuid
    create table GpsRoutes (
        Id uuid default gen_random_uuid()  not null,
       TimeStamp timestamp,
       Name varchar(255),
       Start timestamp,
       End timestamp,
       Origin varchar(255),
       Destination varchar(255),
       IsAproved boolean,
       primary key (Id)
    )
    alter table GpsHistorys 
        add constraint FK_44F55167 
        foreign key (GpsRoute_id) 
        references GpsRoutes
    create table GpsRoutes (
        Id uuid default gen_random_uuid()  not null,
       TimeStamp timestamp,
       Name varchar(255),
       Start timestamp,
       End timestamp,
       Origin varchar(255),
       Destination varchar(255),
       IsAproved boolean,
       primary key (Id)
    )
    alter table GpsHistorys 
        add constraint FK_44F55167 
        foreign key (GpsRoute_id) 
        references GpsRoutes
    create table GpsRoutes (
        Id uuid default gen_random_uuid()  not null,
       TimeStamp timestamp,
       Name varchar(255),
       Start timestamp,
       End timestamp,
       Origin varchar(255),
       Destination varchar(255),
       IsAproved boolean,
       primary key (Id)
    )
    alter table GpsHistorys 
        add constraint FK_44F55167 
        foreign key (GpsRoute_id) 
        references GpsRoutes
    create table GpsRoutes (
        Id uuid default gen_random_uuid()  not null,
       TimeStamp timestamp,
       Name varchar(255),
       Start timestamp,
       End timestamp,
       Origin varchar(255),
       Destination varchar(255),
       IsAproved boolean,
       primary key (Id)
    )
    alter table GpsHistorys 
        add constraint FK_44F55167 
        foreign key (GpsRoute_id) 
        references GpsRoutes
    create table GpsRoutes (
        Id uuid default gen_random_uuid()  not null,
       TimeStamp timestamp,
       Name varchar(255),
       Start timestamp,
       End timestamp,
       Origin varchar(255),
       Destination varchar(255),
       IsAproved boolean,
       primary key (Id)
    )
    alter table GpsHistorys 
        add constraint FK_44F55167 
        foreign key (GpsRoute_id) 
        references GpsRoutes
    create table GpsRoutes (
        Id uuid default gen_random_uuid()  not null,
       TimeStamp timestamp,
       Name varchar(255),
       Start timestamp,
       End timestamp,
       Origin varchar(255),
       Destination varchar(255),
       IsAproved boolean,
       primary key (Id)
    )
    alter table GpsHistorys 
        add constraint FK_44F55167 
        foreign key (GpsRoute_id) 
        references GpsRoutes
    create table GpsRoutes (
        Id uuid default gen_random_uuid()  not null,
       TimeStamp timestamp,
       Name varchar(255),
       Start timestamp,
       End timestamp,
       Origin varchar(255),
       Destination varchar(255),
       IsAproved boolean,
       primary key (Id)
    )
    alter table GpsHistorys 
        add constraint FK_44F55167 
        foreign key (GpsRoute_id) 
        references GpsRoutes
    create table GpsRoutes (
        Id uuid default gen_random_uuid()  not null,
       TimeStamp timestamp,
       Name varchar(255),
       StartAt timestamp,
       EndAt timestamp,
       Origin varchar(255),
       Destination varchar(255),
       IsAproved boolean,
       primary key (Id)
    )
    alter table GpsHistorys 
        add constraint FK_44F55167 
        foreign key (GpsRoute_id) 
        references GpsRoutes
    alter table GpsRoutes 
        add column AsOriginPoint_id uuid
    alter table GpsRoutes 
        add constraint FK_CCCF0117 
        foreign key (AsOriginPoint_id) 
        references GpsHistorys
    create table Zones (
        Id uuid default gen_random_uuid()  not null,
       TimeStamp timestamp,
       EntityId varchar(255),
       Latitude float8,
       Longitude float8,
       Radius float8,
       HASynced boolean,
       primary key (Id)
    )
    alter table Zones 
        add column Name varchar(255)
    create index idx_gpsroutes_startat on GpsRoutes (StartAt)
    create index idx_gpsroutes_endat on GpsRoutes (EndAt)
    alter table GpsRoutes 
        add column IsDeleted boolean
    alter table GpsRoutes 
        add column DeletedStamp timestamp
    alter table GpsRoutes 
        add column CalendarEventId varchar(255)
    create table EngineHistorys (
        Id uuid default gen_random_uuid()  not null,
       TimeStamp timestamp,
       Updated timestamp,
       State varchar(255),
       primary key (Id)
    )
    create table SuggestRouteSplits (
        Id uuid default gen_random_uuid()  not null,
       TimeStamp timestamp,
       PrevEnd timestamp,
       NextStart timestamp,
       SplitePoint_id uuid,
       Route_id uuid,
       primary key (Id)
    )
    alter table SuggestRouteSplits 
        add constraint FK_A3E85447 
        foreign key (SplitePoint_id) 
        references GpsHistorys
    alter table SuggestRouteSplits 
        add constraint FK_3BE0C537 
        foreign key (Route_id) 
        references GpsRoutes
    alter table SuggestRouteSplits 
        add column IsAproved boolean