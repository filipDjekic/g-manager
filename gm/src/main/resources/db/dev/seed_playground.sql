-- G-MANAGER DEVELOPMENT/TEST DATA ONLY.
-- This script deliberately requires @gmanager_allow_dev_seed = 1 in the same session.
-- It is not a Flyway migration and must never be executed against production.

DELIMITER $$

DROP PROCEDURE IF EXISTS seed_gmanager_playground$$
CREATE PROCEDURE seed_gmanager_playground()
BEGIN
    DECLARE v_password_hash VARCHAR(100);
    DECLARE v_i INT DEFAULT 0;
    DECLARE v_j INT DEFAULT 0;
    DECLARE v_sequence INT DEFAULT 0;
    DECLARE v_daily_count INT;
    DECLARE v_day_offset INT;
    DECLARE v_date DATE;
    DECLARE v_start TIMESTAMP(6);
    DECLARE v_end TIMESTAMP(6);
    DECLARE v_status VARCHAR(20);
    DECLARE v_employee INT;
    DECLARE v_customer INT;
    DECLARE v_service INT;
    DECLARE v_duration INT;
    DECLARE v_order_total DECIMAL(12,2);

    IF COALESCE(@gmanager_allow_dev_seed, 0) <> 1 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Refusing to seed: set @gmanager_allow_dev_seed = 1 in this development session';
    END IF;

    SELECT password_hash INTO v_password_hash
    FROM users
    WHERE email = 'owner@example.com' AND deleted_at IS NULL
    LIMIT 1;

    IF v_password_hash IS NULL OR v_password_hash NOT LIKE '$2%' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Development owner owner@example.com with a BCrypt password is required before seeding';
    END IF;

    START TRANSACTION;

    -- Delete only deterministic demo rows, children before parents. Existing user data is untouched.
    DELETE FROM notification_delivery_attempts WHERE notification_id LIKE '70000000-0000-0000-0000-%';
    DELETE FROM notifications WHERE id LIKE '70000000-0000-0000-0000-%';
    DELETE FROM notification_preferences WHERE recipient_id LIKE '10000000-0000-0000-0000-%';
    DELETE FROM search_preferences WHERE owner_id LIKE '10000000-0000-0000-0000-%';
    DELETE FROM dashboard_widget_preferences WHERE owner_id LIKE '10000000-0000-0000-0000-%';
    DELETE FROM saved_views WHERE owner_id LIKE '10000000-0000-0000-0000-%';
    DELETE pt FROM customer_crm_profile_tags pt JOIN customer_crm_profiles p ON p.id=pt.profile_id WHERE p.customer_id LIKE '10000000-0000-0000-0000-%';
    DELETE n FROM customer_crm_notes n JOIN customer_crm_profiles p ON p.id=n.profile_id WHERE p.customer_id LIKE '10000000-0000-0000-0000-%';
    DELETE FROM customer_crm_profiles WHERE customer_id LIKE '10000000-0000-0000-0000-%';
    DELETE FROM waitlist_offers WHERE id LIKE '84100000-0000-0000-0000-%';
    DELETE FROM waitlist_entries WHERE id LIKE '84000000-0000-0000-0000-%';
    DELETE FROM employee_time_off WHERE id LIKE '83000000-0000-0000-0000-%';
    DELETE FROM report_schedules WHERE owner_id LIKE '10000000-0000-0000-0000-%';
    DELETE FROM report_templates WHERE owner_id LIKE '10000000-0000-0000-0000-%';
    DELETE FROM audit_events WHERE id LIKE '60000000-0000-0000-0000-%';
    DELETE FROM security_events WHERE id LIKE '62000000-0000-0000-0000-%';
    DELETE FROM order_items WHERE id LIKE '51000000-0000-0000-0000-%';
    DELETE FROM orders WHERE id LIKE '50000000-0000-0000-0000-%';
    DELETE FROM reservations WHERE id LIKE '40000000-0000-0000-0000-%';
    DELETE FROM reservation_recurrence_series WHERE id LIKE '30000000-0000-0000-0000-%';
    DELETE FROM working_hours_exceptions WHERE id LIKE '22000000-0000-0000-0000-%';
    INSERT INTO users (id,name,email,password_hash,role,active,avatar_url,created_at,updated_at,version,deleted_at,deleted_by,deletion_reason) VALUES
    ('10000000-0000-0000-0000-000000000001','Miloš Jovanović','owner.demo@gmanager.test',v_password_hash,'OWNER',TRUE,NULL,UTC_TIMESTAMP(6)-INTERVAL 400 DAY,UTC_TIMESTAMP(6),0,NULL,NULL,NULL),
    ('10000000-0000-0000-0000-000000000002','Ana Petrović','admin.demo@gmanager.test',v_password_hash,'ADMIN',TRUE,NULL,UTC_TIMESTAMP(6)-INTERVAL 360 DAY,UTC_TIMESTAMP(6),0,NULL,NULL,NULL),
    ('10000000-0000-0000-0000-000000000003','Marko Ilić — menadžer smene','marko.employee@gmanager.test',v_password_hash,'EMPLOYEE',TRUE,NULL,UTC_TIMESTAMP(6)-INTERVAL 330 DAY,UTC_TIMESTAMP(6),0,NULL,NULL,NULL),
    ('10000000-0000-0000-0000-000000000004','Jelena Nikolić','jelena.employee@gmanager.test',v_password_hash,'EMPLOYEE',TRUE,NULL,UTC_TIMESTAMP(6)-INTERVAL 300 DAY,UTC_TIMESTAMP(6),0,NULL,NULL,NULL),
    ('10000000-0000-0000-0000-000000000005','Stefan Savić','stefan.employee@gmanager.test',v_password_hash,'EMPLOYEE',TRUE,NULL,UTC_TIMESTAMP(6)-INTERVAL 270 DAY,UTC_TIMESTAMP(6),0,NULL,NULL,NULL),
    ('10000000-0000-0000-0000-000000000006','Milica Ristić','milica.employee@gmanager.test',v_password_hash,'EMPLOYEE',TRUE,NULL,UTC_TIMESTAMP(6)-INTERVAL 240 DAY,UTC_TIMESTAMP(6),0,NULL,NULL,NULL),
    ('10000000-0000-0000-0000-000000000007','Bivši zaposleni','inactive.employee@gmanager.test',v_password_hash,'EMPLOYEE',FALSE,NULL,UTC_TIMESTAMP(6)-INTERVAL 220 DAY,UTC_TIMESTAMP(6)-INTERVAL 20 DAY,0,NULL,NULL,NULL)
    ON DUPLICATE KEY UPDATE name=VALUES(name),email=VALUES(email),password_hash=VALUES(password_hash),role=VALUES(role),active=VALUES(active),deleted_at=NULL,deleted_by=NULL,deletion_reason=NULL,updated_at=UTC_TIMESTAMP(6);

    SET v_i = 1;
    WHILE v_i <= 36 DO
        INSERT INTO users (id,name,email,password_hash,role,active,avatar_url,created_at,updated_at,version,deleted_at,deleted_by,deletion_reason)
        VALUES (CONCAT('10000000-0000-0000-0000-',LPAD(100+v_i,12,'0')),
                CONCAT(ELT(1+MOD(v_i-1,12),'Nikola','Sara','Luka','Teodora','Vuk','Mina','Aleksa','Una','Filip','Iva','Pavle','Nina'),' ',
                       ELT(1+MOD(v_i*5,12),'Marković','Đorđević','Pavlović','Stojanović','Milošević','Lukić','Kostić','Tomić','Popović','Matić','Živković','Radić')),
                CONCAT('kupac',LPAD(v_i,2,'0'),'@demo.gmanager.test'),v_password_hash,'CUSTOMER',
                IF(v_i=36,FALSE,TRUE),NULL,UTC_TIMESTAMP(6)-INTERVAL (20+v_i*7) DAY,UTC_TIMESTAMP(6),0,NULL,NULL,NULL)
        ON DUPLICATE KEY UPDATE name=VALUES(name),email=VALUES(email),password_hash=VALUES(password_hash),role='CUSTOMER',active=VALUES(active),deleted_at=NULL,deleted_by=NULL,deletion_reason=NULL,updated_at=UTC_TIMESTAMP(6);
        SET v_i = v_i + 1;
    END WHILE;

    INSERT INTO catalog_items (id,name,description,type,price,duration_minutes,active,image_url,created_at,updated_at,version,deleted_at,deleted_by,deletion_reason) VALUES
    ('20000000-0000-0000-0000-000000000001','PC Arena — 60 min','Gaming PC termin sa 240 Hz monitorom i periferijama.','SERVICE',450.00,60,TRUE,NULL,UTC_TIMESTAMP(6)-INTERVAL 300 DAY,UTC_TIMESTAMP(6),0,NULL,NULL,NULL),
    ('20000000-0000-0000-0000-000000000002','PlayStation 5 — 60 min','PS5 stanica za do četiri igrača.','SERVICE',600.00,60,TRUE,NULL,UTC_TIMESTAMP(6)-INTERVAL 290 DAY,UTC_TIMESTAMP(6),0,NULL,NULL,NULL),
    ('20000000-0000-0000-0000-000000000003','Racing simulator — 90 min','Volan, pedale i ultrawide ekran.','SERVICE',950.00,90,TRUE,NULL,UTC_TIMESTAMP(6)-INTERVAL 250 DAY,UTC_TIMESTAMP(6),0,NULL,NULL,NULL),
    ('20000000-0000-0000-0000-000000000004','VIP soba — 120 min','Privatna zona sa dve konzole i velikim ekranom.','SERVICE',1800.00,120,TRUE,NULL,UTC_TIMESTAMP(6)-INTERVAL 230 DAY,UTC_TIMESTAMP(6),0,NULL,NULL,NULL),
    ('20000000-0000-0000-0000-000000000005','Turnirski PC — 60 min','Rezervacija turnirske stanice.','SERVICE',550.00,60,TRUE,NULL,UTC_TIMESTAMP(6)-INTERVAL 180 DAY,UTC_TIMESTAMP(6),0,NULL,NULL,NULL),
    ('20000000-0000-0000-0000-000000000006','VR Arena — 120 min','VR zona trenutno nije dostupna za nove rezervacije.','SERVICE',1400.00,120,FALSE,NULL,UTC_TIMESTAMP(6)-INTERVAL 150 DAY,UTC_TIMESTAMP(6),0,NULL,NULL,NULL),
    ('20000000-0000-0000-0000-000000000101','Coca-Cola 0.33l','Rashlađeno gazirano piće.','PRODUCT',220.00,NULL,TRUE,NULL,UTC_TIMESTAMP(6)-INTERVAL 300 DAY,UTC_TIMESTAMP(6),0,NULL,NULL,NULL),
    ('20000000-0000-0000-0000-000000000102','Voda 0.5l','Negazirana voda.','PRODUCT',140.00,NULL,TRUE,NULL,UTC_TIMESTAMP(6)-INTERVAL 300 DAY,UTC_TIMESTAMP(6),0,NULL,NULL,NULL),
    ('20000000-0000-0000-0000-000000000103','Energetsko piće','Energetsko piće 0.25l.','PRODUCT',280.00,NULL,TRUE,NULL,UTC_TIMESTAMP(6)-INTERVAL 280 DAY,UTC_TIMESTAMP(6),0,NULL,NULL,NULL),
    ('20000000-0000-0000-0000-000000000104','Gaming meni','Sendvič, pomfrit i piće.','PRODUCT',690.00,NULL,TRUE,NULL,UTC_TIMESTAMP(6)-INTERVAL 220 DAY,UTC_TIMESTAMP(6),0,NULL,NULL,NULL),
    ('20000000-0000-0000-0000-000000000105','Nachos','Nachos sa dva sosa.','PRODUCT',420.00,NULL,TRUE,NULL,UTC_TIMESTAMP(6)-INTERVAL 200 DAY,UTC_TIMESTAMP(6),0,NULL,NULL,NULL),
    ('20000000-0000-0000-0000-000000000106','Espresso','Dupli espresso.','PRODUCT',190.00,NULL,TRUE,NULL,UTC_TIMESTAMP(6)-INTERVAL 180 DAY,UTC_TIMESTAMP(6),0,NULL,NULL,NULL),
    ('20000000-0000-0000-0000-000000000107','USB-C kabl','Kabl za punjenje, 1m.','PRODUCT',900.00,NULL,TRUE,NULL,UTC_TIMESTAMP(6)-INTERVAL 120 DAY,UTC_TIMESTAMP(6),0,NULL,NULL,NULL),
    ('20000000-0000-0000-0000-000000000108','Stari promo paket','Arhivirana promotivna stavka.','PRODUCT',350.00,NULL,FALSE,NULL,UTC_TIMESTAMP(6)-INTERVAL 200 DAY,UTC_TIMESTAMP(6)-INTERVAL 30 DAY,0,NULL,NULL,NULL)
    ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),type=VALUES(type),price=VALUES(price),duration_minutes=VALUES(duration_minutes),active=VALUES(active),deleted_at=NULL,deleted_by=NULL,deletion_reason=NULL,updated_at=UTC_TIMESTAMP(6);

    UPDATE working_hours SET open_time='12:00:00',close_time='23:00:00',active=TRUE,updated_at=UTC_TIMESTAMP(6),version=version+1 WHERE day_of_week IN ('MONDAY','TUESDAY','WEDNESDAY','THURSDAY');
    UPDATE working_hours SET open_time='12:00:00',close_time='01:00:00',active=TRUE,updated_at=UTC_TIMESTAMP(6),version=version+1 WHERE day_of_week='FRIDAY';
    UPDATE working_hours SET open_time='10:00:00',close_time='01:00:00',active=TRUE,updated_at=UTC_TIMESTAMP(6),version=version+1 WHERE day_of_week='SATURDAY';
    UPDATE working_hours SET open_time='10:00:00',close_time='23:00:00',active=TRUE,updated_at=UTC_TIMESTAMP(6),version=version+1 WHERE day_of_week='SUNDAY';
    INSERT INTO working_hours_exceptions (id,exception_date,description,full_day_closed,override_open_time,override_close_time,created_at,updated_at,version) VALUES
    ('22000000-0000-0000-0000-000000000001',UTC_DATE()+INTERVAL 35 DAY,'Planirano održavanje',TRUE,NULL,NULL,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6),0),
    ('22000000-0000-0000-0000-000000000002',UTC_DATE()+INTERVAL 42 DAY,'Produženo radno vreme za turnir',FALSE,'10:00:00','02:00:00',UTC_TIMESTAMP(6),UTC_TIMESTAMP(6),0);

    -- 224 non-overlapping reservations over 16 weeks. Weekend/evening demand is intentionally higher.
    SET v_day_offset = -90;
    SET v_sequence = 1;
    WHILE v_day_offset <= 21 DO
        SET v_date = UTC_DATE() + INTERVAL v_day_offset DAY;
        SET v_daily_count = CASE DAYOFWEEK(v_date) WHEN 7 THEN 4 WHEN 6 THEN 3 WHEN 1 THEN 2 ELSE 1 END;
        SET v_j = 0;
        WHILE v_j < v_daily_count DO
            SET v_employee = 3 + MOD(v_day_offset + 900 + v_j,3);
            SET v_customer = 1 + MOD(v_sequence*7 + v_j*3,36);
            SET v_service = 1 + MOD(v_sequence + v_j,5);
            SET v_duration = CASE v_service WHEN 3 THEN 90 WHEN 4 THEN 120 ELSE 60 END;
            SET v_start = TIMESTAMP(v_date) + INTERVAL (13 + v_j*2) HOUR;
            SET v_end = v_start + INTERVAL v_duration MINUTE;
            SET v_status = CASE
                WHEN v_date < UTC_DATE() THEN CASE MOD(v_sequence,10) WHEN 8 THEN 'CANCELLED' WHEN 9 THEN 'REJECTED' ELSE 'COMPLETED' END
                WHEN v_date = UTC_DATE() THEN CASE WHEN v_end <= UTC_TIMESTAMP() THEN 'COMPLETED' WHEN v_j=0 THEN 'PENDING' ELSE 'CONFIRMED' END
                ELSE CASE WHEN MOD(v_sequence,10)<2 THEN 'PENDING' WHEN MOD(v_sequence,10)=9 THEN 'CANCELLED' ELSE 'CONFIRMED' END END;
            INSERT INTO reservations (id,customer_id,employee_id,service_id,start_time,end_time,status,note,created_at,updated_at,version,recurrence_series_id)
            VALUES (CONCAT('40000000-0000-0000-0000-',LPAD(v_sequence,12,'0')),
                    CONCAT('10000000-0000-0000-0000-',LPAD(100+v_customer,12,'0')),
                    CONCAT('10000000-0000-0000-0000-',LPAD(v_employee,12,'0')),
                    CONCAT('20000000-0000-0000-0000-',LPAD(v_service,12,'0')),
                    v_start,v_end,v_status,
                    CASE MOD(v_sequence,7) WHEN 0 THEN 'Rođendanska ekipa' WHEN 1 THEN 'Redovni termin' WHEN 2 THEN 'Molimo susedne stanice' ELSE NULL END,
                    LEAST(UTC_TIMESTAMP(6),v_start-INTERVAL (2+MOD(v_sequence,12)) DAY),UTC_TIMESTAMP(6),0,NULL);
            SET v_sequence = v_sequence + 1;
            SET v_j = v_j + 1;
        END WHILE;
        SET v_day_offset = v_day_offset + 1;
    END WHILE;

    INSERT INTO reservation_recurrence_series (id,customer_id,frequency,interval_value,requested_occurrences,conflict_policy,created_at,updated_at,version)
    VALUES ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000101','WEEKLY',1,4,'ALL_OR_NOTHING',UTC_TIMESTAMP(6),UTC_TIMESTAMP(6),0);
    SET @next_monday = UTC_DATE()+INTERVAL (CASE WHEN MOD(9-DAYOFWEEK(UTC_DATE()),7)=0 THEN 7 ELSE MOD(9-DAYOFWEEK(UTC_DATE()),7) END) DAY;
    SET v_i=0;
    WHILE v_i<4 DO
        SET v_start=TIMESTAMP(@next_monday+INTERVAL (v_i*7) DAY)+INTERVAL 12 HOUR;
        INSERT INTO reservations (id,customer_id,employee_id,service_id,start_time,end_time,status,note,created_at,updated_at,version,recurrence_series_id)
        VALUES (CONCAT('40000000-0000-0000-0001-',LPAD(v_i+1,12,'0')),'10000000-0000-0000-0000-000000000101','10000000-0000-0000-0000-000000000006',
                '20000000-0000-0000-0000-000000000001',v_start,v_start+INTERVAL 60 MINUTE,'CONFIRMED','Nedeljni trening',UTC_TIMESTAMP(6),UTC_TIMESTAMP(6),0,'30000000-0000-0000-0000-000000000001');
        SET v_i=v_i+1;
    END WHILE;

    INSERT INTO audit_events (id,actor_id,actor_role,action,resource_type,resource_id,before_data,after_data,reason,visibility,created_at,updated_at,version)
    SELECT CONCAT('60000000-0000-0000-0000-',RIGHT(id,12)),'10000000-0000-0000-0000-000000000001','OWNER','RESERVATION_STATUS_CHANGED','RESERVATION',id,
           '{"status":"CONFIRMED"}',CONCAT('{"status":"',status,'"}'),IF(status IN ('CANCELLED','REJECTED'),'Promena evidentirana u demo scenariju',NULL),'MANAGEMENT',updated_at,updated_at,0
    FROM reservations WHERE id LIKE '40000000-0000-0000-0000-%' AND status IN ('COMPLETED','CANCELLED','REJECTED');

    -- 120 orders with non-uniform historic/current status and exact line totals.
    SET v_i=1;
    WHILE v_i<=120 DO
        SET v_day_offset=-89+MOD(v_i*17,90);
        SET v_customer=1+MOD(v_i*11,36);
        SET v_status=CASE WHEN v_day_offset<-2 THEN IF(MOD(v_i,11)=0,'CANCELLED','COMPLETED') ELSE ELT(1+MOD(v_i,5),'CREATED','IN_PROGRESS','READY','COMPLETED','CANCELLED') END;
        SET v_order_total=(1+MOD(v_i,3))*220.00 + IF(MOD(v_i,2)=0,(1+MOD(v_i,2))*420.00,0);
        INSERT INTO orders (id,customer_id,handled_by,status,total_price,created_at,updated_at,version)
        VALUES (CONCAT('50000000-0000-0000-0000-',LPAD(v_i,12,'0')),
                CONCAT('10000000-0000-0000-0000-',LPAD(100+v_customer,12,'0')),
                IF(v_status='CREATED',NULL,CONCAT('10000000-0000-0000-0000-',LPAD(3+MOD(v_i,3),12,'0'))),v_status,v_order_total,
                TIMESTAMP(UTC_DATE()+INTERVAL v_day_offset DAY)+INTERVAL (10+MOD(v_i,10)) HOUR,UTC_TIMESTAMP(6),0);
        INSERT INTO order_items (id,order_id,product_id,quantity,unit_price,line_total)
        VALUES (CONCAT('51000000-0000-0000-0000-',LPAD(v_i*10+1,12,'0')),CONCAT('50000000-0000-0000-0000-',LPAD(v_i,12,'0')),
                '20000000-0000-0000-0000-000000000101',1+MOD(v_i,3),220.00,(1+MOD(v_i,3))*220.00);
        IF MOD(v_i,2)=0 THEN
            INSERT INTO order_items (id,order_id,product_id,quantity,unit_price,line_total)
            VALUES (CONCAT('51000000-0000-0000-0000-',LPAD(v_i*10+2,12,'0')),CONCAT('50000000-0000-0000-0000-',LPAD(v_i,12,'0')),
                    '20000000-0000-0000-0000-000000000105',1+MOD(v_i,2),420.00,(1+MOD(v_i,2))*420.00);
        END IF;
        SET v_i=v_i+1;
    END WHILE;

    INSERT INTO customer_crm_tags (id,name,normalized_name,created_at,updated_at,version) VALUES
    ('81000000-0000-0000-0000-000000000001','Redovan gost','redovan gost',UTC_TIMESTAMP(6),UTC_TIMESTAMP(6),0),
    ('81000000-0000-0000-0000-000000000002','Turniri','turniri',UTC_TIMESTAMP(6),UTC_TIMESTAMP(6),0),
    ('81000000-0000-0000-0000-000000000003','VIP','vip',UTC_TIMESTAMP(6),UTC_TIMESTAMP(6),0),
    ('81000000-0000-0000-0000-000000000004','Novi gost','novi gost',UTC_TIMESTAMP(6),UTC_TIMESTAMP(6),0)
    ON DUPLICATE KEY UPDATE name=VALUES(name),normalized_name=VALUES(normalized_name),updated_at=UTC_TIMESTAMP(6);
    SET v_i=1;
    WHILE v_i<=36 DO
        INSERT INTO customer_crm_profiles (id,customer_id,created_at,updated_at,version)
        VALUES (CONCAT('80000000-0000-0000-0000-',LPAD(v_i,12,'0')),CONCAT('10000000-0000-0000-0000-',LPAD(100+v_i,12,'0')),UTC_TIMESTAMP(6),UTC_TIMESTAMP(6),0);
        INSERT INTO customer_crm_profile_tags (profile_id,tag_id)
        VALUES (CONCAT('80000000-0000-0000-0000-',LPAD(v_i,12,'0')),CONCAT('81000000-0000-0000-0000-',LPAD(1+MOD(v_i,4),12,'0')));
        IF MOD(v_i,3)=0 THEN
            INSERT INTO customer_crm_notes (id,profile_id,body,created_by,expires_at,created_at,updated_at,version)
            VALUES (CONCAT('82000000-0000-0000-0000-',LPAD(v_i,12,'0')),CONCAT('80000000-0000-0000-0000-',LPAD(v_i,12,'0')),
                    'Gost preferira večernje termine; kontaktirati samo u vezi postojeće rezervacije.','10000000-0000-0000-0000-000000000002',UTC_TIMESTAMP(6)+INTERVAL 700 DAY,UTC_TIMESTAMP(6)-INTERVAL v_i DAY,UTC_TIMESTAMP(6),0);
        END IF;
        SET v_i=v_i+1;
    END WHILE;

    INSERT INTO employee_time_off (id,employee_id,starts_at,ends_at,status,reason,decision_reason,created_at,updated_at,version) VALUES
    ('83000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003',UTC_TIMESTAMP(6)+INTERVAL 30 DAY,UTC_TIMESTAMP(6)+INTERVAL 32 DAY,'APPROVED','Planirani odmor','Odobreno u demo scenariju',UTC_TIMESTAMP(6),UTC_TIMESTAMP(6),0),
    ('83000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000004',UTC_TIMESTAMP(6)+INTERVAL 45 DAY,UTC_TIMESTAMP(6)+INTERVAL 46 DAY,'PENDING','Privatne obaveze',NULL,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6),0),
    ('83000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000006',UTC_TIMESTAMP(6)-INTERVAL 50 DAY,UTC_TIMESTAMP(6)-INTERVAL 48 DAY,'APPROVED','Godišnji odmor','Odobreno',UTC_TIMESTAMP(6)-INTERVAL 70 DAY,UTC_TIMESTAMP(6)-INTERVAL 70 DAY,0);

    SET v_i=1;
    WHILE v_i<=8 DO
        INSERT INTO waitlist_entries (id,customer_id,employee_id,service_id,desired_start,status,active_key,created_at,updated_at,version)
        VALUES (CONCAT('84000000-0000-0000-0000-',LPAD(v_i,12,'0')),CONCAT('10000000-0000-0000-0000-',LPAD(100+v_i,12,'0')),
                CONCAT('10000000-0000-0000-0000-',LPAD(3+MOD(v_i,3),12,'0')),'20000000-0000-0000-0000-000000000004',
                TIMESTAMP(UTC_DATE()+INTERVAL (7+v_i) DAY)+INTERVAL 18 HOUR,IF(v_i<=6,'WAITING','CANCELLED'),IF(v_i<=6,CONCAT('demo-waitlist-',v_i),NULL),UTC_TIMESTAMP(6)-INTERVAL v_i DAY,UTC_TIMESTAMP(6),0);
        SET v_i=v_i+1;
    END WHILE;

    INSERT INTO notification_preferences (id,recipient_id,type,in_app_enabled,email_enabled,created_at,updated_at,version) VALUES
    ('71000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000101','RESERVATION_STATUS_CHANGED',TRUE,FALSE,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6),0),
    ('71000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000102','ORDER_STATUS_CHANGED',FALSE,FALSE,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6),0);
    SET v_i=1;
    WHILE v_i<=24 DO
        INSERT INTO notifications (id,source_event_id,recipient_id,type,priority,title,body,resource_type,resource_id,deep_link,in_app_visible,read_at,created_at,updated_at,version)
        VALUES (CONCAT('70000000-0000-0000-0000-',LPAD(v_i,12,'0')),CONCAT('70000000-0000-0000-0001-',LPAD(v_i,12,'0')),
                CONCAT('10000000-0000-0000-0000-',LPAD(100+MOD(v_i-1,12)+1,12,'0')),'RESERVATION_STATUS_CHANGED',IF(MOD(v_i,6)=0,'HIGH','NORMAL'),
                'Promenjen status termina',CONCAT('Vaš termin ima status ',IF(MOD(v_i,5)=0,'CANCELLED','COMPLETED'),'.'),'RESERVATION',
                CONCAT('40000000-0000-0000-0000-',LPAD(v_i,12,'0')),CONCAT('/reservations?focus=40000000-0000-0000-0000-',LPAD(v_i,12,'0')),TRUE,
                IF(v_i<=14,UTC_TIMESTAMP(6)-INTERVAL (24-v_i) HOUR,NULL),UTC_TIMESTAMP(6)-INTERVAL (25-v_i) HOUR,UTC_TIMESTAMP(6),0);
        SET v_i=v_i+1;
    END WHILE;

    INSERT INTO dashboard_widget_preferences (id,owner_id,widget_key,widget_position,visible,threshold,created_at,updated_at,version) VALUES
    ('85100000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','trends',0,TRUE,NULL,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6),0),
    ('85100000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','statuses',1,TRUE,NULL,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6),0),
    ('85100000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','workload',2,TRUE,75.00,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6),0);
    INSERT INTO saved_views (id,owner_id,resource_type,name,query_json,created_at,updated_at,version) VALUES
    ('85200000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','RESERVATIONS','Budući potvrđeni','{"status":"CONFIRMED","sort":"startTime","direction":"asc"}',UTC_TIMESTAMP(6),UTC_TIMESTAMP(6),0),
    ('85200000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','ORDERS','Narudžbine u radu','{"status":"IN_PROGRESS","sort":"createdAt","direction":"desc"}',UTC_TIMESTAMP(6),UTC_TIMESTAMP(6),0);
    INSERT INTO search_preferences (id,owner_id,resource_type,resource_id,favorite,last_accessed_at,created_at,updated_at,version) VALUES
    ('85000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','CATALOG','20000000-0000-0000-0000-000000000004',TRUE,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6),UTC_TIMESTAMP(6),0),
    ('85000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','USER','10000000-0000-0000-0000-000000000103',TRUE,UTC_TIMESTAMP(6)-INTERVAL 1 HOUR,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6),0);

    INSERT INTO report_templates (id,owner_id,name,definition_key,format,filters_json,created_at,updated_at,version) VALUES
    ('86100000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Mesečni promet','revenue','CSV',CONCAT(UTC_TIMESTAMP(6)-INTERVAL 30 DAY,'|',UTC_TIMESTAMP(6)),UTC_TIMESTAMP(6),UTC_TIMESTAMP(6),0),
    ('86100000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Opterećenje zaposlenih','workload','XLSX',CONCAT(UTC_TIMESTAMP(6)-INTERVAL 14 DAY,'|',UTC_TIMESTAMP(6)),UTC_TIMESTAMP(6),UTC_TIMESTAMP(6),0);
    INSERT INTO report_schedules (id,owner_id,definition_key,format,filters_json,timezone,local_time,day_of_week,active,next_run_at,last_run_at,created_at,updated_at,version) VALUES
    ('86000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','revenue','CSV',CONCAT(UTC_TIMESTAMP(6)-INTERVAL 7 DAY,'|',UTC_TIMESTAMP(6)),'Europe/Belgrade','08:00:00',1,TRUE,UTC_TIMESTAMP(6)+INTERVAL 7 DAY,NULL,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6),0);

    INSERT INTO security_events (id,user_id,session_id,event_type,device_label,ip_hash,created_at,updated_at,version) VALUES
    ('62000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',NULL,'LOGIN_SUCCESS','Chrome on Windows',REPEAT('a',64),UTC_TIMESTAMP(6)-INTERVAL 2 DAY,UTC_TIMESTAMP(6)-INTERVAL 2 DAY,0),
    ('62000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002',NULL,'LOGIN_SUCCESS','Firefox on Linux',REPEAT('b',64),UTC_TIMESTAMP(6)-INTERVAL 1 DAY,UTC_TIMESTAMP(6)-INTERVAL 1 DAY,0);

    -- Executable integrity assertions. Any failure rolls the whole transaction back.
    IF (SELECT COUNT(*) FROM reservations WHERE id LIKE '40000000-0000-0000-0000-%' OR id LIKE '40000000-0000-0000-0001-%') <> v_sequence+3 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Seed validation failed: generated reservation count mismatch';
    END IF;
    IF EXISTS (SELECT 1 FROM reservations r JOIN catalog_items c ON c.id=r.service_id WHERE r.id LIKE '40000000-%' AND TIMESTAMPDIFF(MINUTE,r.start_time,r.end_time)<>c.duration_minutes) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Seed validation failed: reservation duration mismatch';
    END IF;
    IF EXISTS (SELECT 1 FROM reservations a JOIN reservations b ON a.employee_id=b.employee_id AND a.id<b.id AND a.start_time<b.end_time AND a.end_time>b.start_time
               WHERE a.id LIKE '40000000-%' AND b.id LIKE '40000000-%' AND a.status NOT IN ('CANCELLED','REJECTED') AND b.status NOT IN ('CANCELLED','REJECTED')) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Seed validation failed: blocking reservations overlap';
    END IF;
    IF EXISTS (SELECT 1 FROM orders o LEFT JOIN (SELECT order_id,SUM(line_total) total FROM order_items GROUP BY order_id) i ON i.order_id=o.id
               WHERE o.id LIKE '50000000-%' AND o.total_price<>COALESCE(i.total,0)) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Seed validation failed: order total mismatch';
    END IF;
    IF EXISTS (SELECT 1 FROM reservations r JOIN users c ON c.id=r.customer_id JOIN users e ON e.id=r.employee_id JOIN catalog_items s ON s.id=r.service_id
               WHERE r.id LIKE '40000000-%' AND (c.role<>'CUSTOMER' OR e.role<>'EMPLOYEE' OR s.type<>'SERVICE')) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Seed validation failed: reservation role/type mismatch';
    END IF;

    COMMIT;
END$$

CALL seed_gmanager_playground()$$
DROP PROCEDURE seed_gmanager_playground$$
DELIMITER ;

SELECT role,COUNT(*) AS users FROM users WHERE id LIKE '10000000-%' GROUP BY role ORDER BY role;
SELECT type,active,COUNT(*) AS catalog_items FROM catalog_items WHERE id LIKE '20000000-%' GROUP BY type,active ORDER BY type,active;
SELECT status,COUNT(*) AS reservations FROM reservations WHERE id LIKE '40000000-%' GROUP BY status ORDER BY status;
SELECT status,COUNT(*) AS orders FROM orders WHERE id LIKE '50000000-%' GROUP BY status ORDER BY status;
