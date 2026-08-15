package com.game_manager.gm.customer;

import com.game_manager.gm.common.dto.PageResponse;
import com.game_manager.gm.customer.dto.CustomerDetailResponse;
import com.game_manager.gm.customer.dto.CustomerListItemResponse;
import com.game_manager.gm.customer.dto.CreateCustomerRequest;
import com.game_manager.gm.customer.dto.CustomerOnboardingResponse;
import com.game_manager.gm.customer.dto.UpdateCustomerRequest;
import com.game_manager.gm.user.dto.UserResponse;
import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/customers")
@RequiredArgsConstructor
public class CustomerController {
    private final CustomerService customerService;
    private final CustomerAccountService customerAccountService;

    @PostMapping
    public ResponseEntity<CustomerOnboardingResponse> create(
            @Valid @RequestBody CreateCustomerRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(customerAccountService.create(request));
    }

    @PatchMapping("/{id}")
    public UserResponse update(@PathVariable UUID id,
            @Valid @RequestBody UpdateCustomerRequest request) {
        return customerAccountService.update(id, request);
    }

    @PostMapping("/{id}/deactivate")
    public ResponseEntity<Void> deactivate(@PathVariable UUID id) {
        customerAccountService.deactivate(id);
        return ResponseEntity.noContent().build();
    }

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
