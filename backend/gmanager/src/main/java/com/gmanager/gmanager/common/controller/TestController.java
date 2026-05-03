package com.gmanager.gmanager.common.controller;

import com.gmanager.gmanager.common.exception.BadRequestException;
import com.gmanager.gmanager.common.exception.ConflictException;
import com.gmanager.gmanager.common.exception.ForbiddenException;
import com.gmanager.gmanager.common.exception.NotFoundException;
import com.gmanager.gmanager.common.exception.UnauthorizedException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class TestController {

    @GetMapping("/api/v1/test/bad-request")
    public void badRequest() {
        throw new BadRequestException("Bad request test");
    }

    @GetMapping("/api/v1/test/unauthorized")
    public void unauthorized() {
        throw new UnauthorizedException("Unauthorized test");
    }

    @GetMapping("/api/v1/test/forbidden")
    public void forbidden() {
        throw new ForbiddenException("Forbidden test");
    }

    @GetMapping("/api/v1/test/not-found")
    public void notFound() {
        throw new NotFoundException("Not found test");
    }

    @GetMapping("/api/v1/test/conflict")
    public void conflict() {
        throw new ConflictException("Conflict test");
    }
}