package com.gmanager.gmanager.reservation.domain;

import jakarta.persistence.*;

import java.time.LocalTime;

@Entity
@Table(name = "working_hours")
public class WorkingHours {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "day_of_week", nullable = false, unique = true)
    private Integer dayOfWeek;

    @Column(name = "open_time", nullable = false)
    private LocalTime openTime;

    @Column(name = "close_time", nullable = false)
    private LocalTime closeTime;

    @Column(nullable = false)
    private boolean active = true;

    @Version
    @Column(nullable = false)
    private Long version;

    protected WorkingHours() {
    }

    public WorkingHours(Integer dayOfWeek, LocalTime openTime, LocalTime closeTime) {
        this.dayOfWeek = dayOfWeek;
        this.openTime = openTime;
        this.closeTime = closeTime;
        this.active = true;
    }

    @PrePersist
    void prePersist() {
        if (this.version == null) {
            this.version = 0L;
        }
    }

    public void update(LocalTime openTime, LocalTime closeTime, boolean active) {
        this.openTime = openTime;
        this.closeTime = closeTime;
        this.active = active;
    }

    public Long getId() {
        return id;
    }

    public Integer getDayOfWeek() {
        return dayOfWeek;
    }

    public LocalTime getOpenTime() {
        return openTime;
    }

    public LocalTime getCloseTime() {
        return closeTime;
    }

    public boolean isActive() {
        return active;
    }

    public Long getVersion() {
        return version;
    }
}