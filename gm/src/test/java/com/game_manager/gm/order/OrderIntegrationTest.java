package com.game_manager.gm.order;

import com.game_manager.gm.catalog.CatalogItem;
import com.game_manager.gm.catalog.CatalogRepository;
import com.game_manager.gm.catalog.ItemType;
import com.game_manager.gm.common.security.Role;
import com.game_manager.gm.user.User;
import com.game_manager.gm.user.UserRepository;
import java.math.BigDecimal;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class OrderIntegrationTest {
    @Autowired private MockMvc mockMvc;
    @Autowired private UserRepository userRepository;
    @Autowired private CatalogRepository catalogRepository;
    @Autowired private OrderRepository orderRepository;
    @Autowired private PasswordEncoder passwordEncoder;

    @Test
    void createUsesServerPricesIsAtomicAndIdempotent() throws Exception {
        User customer = createUser(Role.CUSTOMER);
        CatalogItem first = createCatalog(ItemType.PRODUCT, true, "125.50");
        CatalogItem second = createCatalog(ItemType.PRODUCT, true, "49.25");
        String token = login(customer);
        String body = createBody(first.getId(), 2, second.getId(), 3);
        long countBefore = orderRepository.count();

        mockMvc.perform(post("/api/v1/orders")
                        .header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest());

        String key = UUID.randomUUID().toString();
        MvcResult created = mockMvc.perform(post("/api/v1/orders")
                        .header("Authorization", bearer(token))
                        .header("Idempotency-Key", key)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andExpect(header().string("Idempotency-Replayed", "false"))
                .andExpect(jsonPath("$.status").value("CREATED"))
                .andExpect(jsonPath("$.totalPrice").value(398.75))
                .andExpect(jsonPath("$.items[0].unitPrice").value(125.50))
                .andReturn();
        String id = json(created, "id");

        mockMvc.perform(post("/api/v1/orders")
                        .header("Authorization", bearer(token))
                        .header("Idempotency-Key", key)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andExpect(header().string("Idempotency-Replayed", "true"))
                .andExpect(jsonPath("$.id").value(id));
        assertThat(orderRepository.count()).isEqualTo(countBefore + 1);

        mockMvc.perform(post("/api/v1/orders")
                        .header("Authorization", bearer(token))
                        .header("Idempotency-Key", key)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody(first.getId(), 1, second.getId(), 1)))
                .andExpect(status().isConflict());

        User secondCustomer = createUser(Role.CUSTOMER);
        String secondToken = login(secondCustomer);
        mockMvc.perform(post("/api/v1/orders")
                        .header("Authorization", bearer(secondToken))
                        .header("Idempotency-Key", key)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(org.hamcrest.Matchers.not(id)));
        assertThat(orderRepository.count()).isEqualTo(countBefore + 2);
    }

    @Test
    void createRejectsServiceInactiveMissingAndDuplicateProductsWithoutPartialOrder()
            throws Exception {
        User customer = createUser(Role.CUSTOMER);
        CatalogItem product = createCatalog(ItemType.PRODUCT, true, "100.00");
        CatalogItem inactive = createCatalog(ItemType.PRODUCT, false, "100.00");
        CatalogItem service = createCatalog(ItemType.SERVICE, true, "100.00");
        String token = login(customer);
        long countBefore = orderRepository.count();

        create(token, oneItemBody(service.getId(), 1)).andExpect(status().isUnprocessableEntity());
        create(token, oneItemBody(inactive.getId(), 1)).andExpect(status().isUnprocessableEntity());
        create(token, oneItemBody(UUID.randomUUID(), 1)).andExpect(status().isNotFound());
        create(token, "{\"items\":[]}").andExpect(status().isBadRequest());
        create(token, """
                {"items":[{"productId":"%s","quantity":1},{"productId":"%s","quantity":2}]}
                """.formatted(product.getId(), product.getId()))
                .andExpect(status().isUnprocessableEntity());
        assertThat(orderRepository.count()).isEqualTo(countBefore);
    }

    @Test
    void readsAreOwnershipScopedAndSupportOperationalFilters() throws Exception {
        User customer = createUser(Role.CUSTOMER);
        User otherCustomer = createUser(Role.CUSTOMER);
        User employee = createUser(Role.EMPLOYEE);
        CatalogItem product = createCatalog(ItemType.PRODUCT, true, "200.00");
        Order mine = createOrder(customer, product, OrderStatus.CREATED, null);
        createOrder(otherCustomer, product, OrderStatus.IN_PROGRESS, employee.getId());

        mockMvc.perform(get("/api/v1/orders/me?size=100")
                        .header("Authorization", bearer(login(customer))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].id").value(mine.getId().toString()));
        mockMvc.perform(get("/api/v1/orders?status=IN_PROGRESS&handledBy={id}", employee.getId())
                        .header("Authorization", bearer(login(employee))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].handledBy").value(employee.getId().toString()));
    }

    @Test
    void stateMachineOwnershipAndVersionsAreEnforced() throws Exception {
        User customer = createUser(Role.CUSTOMER);
        User employee = createUser(Role.EMPLOYEE);
        User otherEmployee = createUser(Role.EMPLOYEE);
        User admin = createUser(Role.ADMIN);
        CatalogItem product = createCatalog(ItemType.PRODUCT, true, "300.00");
        Order order = createOrder(customer, product, OrderStatus.CREATED, null);

        MvcResult claimed = change(employee, order, "IN_PROGRESS", order.getVersion())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.handledBy").value(employee.getId().toString()))
                .andReturn();
        long claimedVersion = Long.parseLong(json(claimed, "version"));

        change(otherEmployee, order, "READY", claimedVersion).andExpect(status().isForbidden());
        change(customer, order, "CANCELLED", claimedVersion).andExpect(status().isForbidden());
        MvcResult ready = change(employee, order, "READY", claimedVersion)
                .andExpect(status().isOk()).andReturn();
        long readyVersion = Long.parseLong(json(ready, "version"));
        change(employee, order, "CANCELLED", readyVersion).andExpect(status().isForbidden());
        change(employee, order, "COMPLETED", claimedVersion).andExpect(status().isConflict());
        change(admin, order, "CANCELLED", readyVersion)
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CANCELLED"));

        Order cancellable = createOrder(customer, product, OrderStatus.CREATED, null);
        change(customer, cancellable, "CANCELLED", cancellable.getVersion())
                .andExpect(status().isOk());
    }

    private org.springframework.test.web.servlet.ResultActions create(String token, String body)
            throws Exception {
        return mockMvc.perform(post("/api/v1/orders")
                .header("Authorization", bearer(token))
                .header("Idempotency-Key", UUID.randomUUID())
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private org.springframework.test.web.servlet.ResultActions change(
            User actor, Order order, String status, long version) throws Exception {
        return mockMvc.perform(patch("/api/v1/orders/{id}/status", order.getId())
                .header("Authorization", bearer(login(actor)))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"%s\",\"version\":%d}".formatted(status, version)));
    }

    private Order createOrder(User customer, CatalogItem product, OrderStatus status, UUID handledBy) {
        Order order = new Order();
        order.setCustomerId(customer.getId());
        order.setHandledBy(handledBy);
        order.setStatus(status);
        order.setTotalPrice(product.getPrice());
        OrderItem item = new OrderItem();
        item.setProductId(product.getId());
        item.setQuantity(1);
        item.setUnitPrice(product.getPrice());
        item.setLineTotal(product.getPrice());
        order.addItem(item);
        return orderRepository.saveAndFlush(order);
    }

    private CatalogItem createCatalog(ItemType type, boolean active, String price) {
        CatalogItem item = new CatalogItem();
        item.setName(type + " Order " + UUID.randomUUID());
        item.setType(type);
        item.setPrice(new BigDecimal(price));
        item.setDurationMinutes(type == ItemType.SERVICE ? 30 : null);
        item.setActive(active);
        return catalogRepository.saveAndFlush(item);
    }

    private User createUser(Role role) {
        User user = new User();
        user.setName(role + " Order User");
        user.setEmail(role.name().toLowerCase() + "-order-" + UUID.randomUUID() + "@example.com");
        user.setPasswordHash(passwordEncoder.encode("StrongPass1!"));
        user.setRole(role);
        user.setActive(true);
        return userRepository.saveAndFlush(user);
    }

    private String login(User user) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"%s\",\"password\":\"StrongPass1!\"}".formatted(user.getEmail())))
                .andExpect(status().isOk()).andReturn();
        return json(result, "token");
    }

    private String createBody(UUID first, int firstQuantity, UUID second, int secondQuantity) {
        return """
                {"items":[{"productId":"%s","quantity":%d},{"productId":"%s","quantity":%d}]}
                """.formatted(first, firstQuantity, second, secondQuantity);
    }

    private String oneItemBody(UUID product, int quantity) {
        return "{\"items\":[{\"productId\":\"%s\",\"quantity\":%d}]}".formatted(product, quantity);
    }

    private String json(MvcResult result, String field) throws Exception {
        return new tools.jackson.databind.ObjectMapper()
                .readTree(result.getResponse().getContentAsByteArray()).get(field).asText();
    }

    private String bearer(String token) {
        return "Bearer " + token;
    }
}
