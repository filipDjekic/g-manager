package com.game_manager.gm.customer;

import com.game_manager.gm.common.dto.PageResponse;
import com.game_manager.gm.customer.dto.CustomerDetailResponse;
import com.game_manager.gm.customer.dto.CustomerListItemResponse;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/customers")
@RequiredArgsConstructor
public class CustomerController {
    private final CustomerService customerService;

    @GetMapping
    public PageResponse<CustomerListItemResponse> list(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) Boolean active,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return customerService.list(search, active, page, size);
    }

    @GetMapping("/{id}")
    public CustomerDetailResponse detail(@PathVariable UUID id) {
        return customerService.detail(id);
    }
}
