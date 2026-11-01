package com.game_manager.gm.customer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

import com.game_manager.gm.common.error.ApplicationException;
import com.game_manager.gm.auth.dto.ActivateCustomerRequest;
import com.game_manager.gm.customer.dto.CustomerOnboardingResponse;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class CustomerActivationCodeGeneratorTest {
    @Test
    void requestAndOneTimeResponseRedactSecretsWhenFormattedForLogs() {
        var request = new ActivateCustomerRequest("customer@example.test", "A7K2", "CustomerPass1!");
        var response = new CustomerOnboardingResponse(java.util.UUID.randomUUID(), "Customer", "customer@example.test",
                true, 0, "A7K2", java.time.Instant.now().plusSeconds(3600));
        assertThat(request.toString()).doesNotContain("A7K2", "CustomerPass1!");
        assertThat(response.toString()).doesNotContain("A7K2");
    }

    @Test
    void retriesACollisionWhileHoldingTheDatabaseGenerationLock() {
        var guard = mock(CustomerActivationGuard.class);
        var tokens = mock(CustomerActivationTokenRepository.class);
        var hashes = mock(CustomerActivationHash.class);
        when(hashes.hash(anyString(), anyString())).thenReturn("hash");
        when(tokens.findByHashForUpdate("hash")).thenReturn(Optional.of(new CustomerActivationToken()), Optional.empty());
        String code = new CustomerActivationCodeGenerator(guard, tokens, hashes).generate();
        assertThat(code).matches("[A-Z0-9]{4}");
        var order = inOrder(guard, tokens);
        order.verify(guard).lockGeneration();
        order.verify(tokens, times(2)).findByHashForUpdate("hash");
    }

    @Test
    void refusesToIssueADuplicateWhenTheRetryBudgetIsExhausted() {
        var tokens = mock(CustomerActivationTokenRepository.class);
        var hashes = mock(CustomerActivationHash.class);
        when(hashes.hash(anyString(), anyString())).thenReturn("hash");
        when(tokens.findByHashForUpdate("hash")).thenReturn(Optional.of(new CustomerActivationToken()));
        var generator = new CustomerActivationCodeGenerator(mock(CustomerActivationGuard.class), tokens, hashes);
        assertThatThrownBy(generator::generate).isInstanceOf(ApplicationException.class)
                .extracting("status").isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        verify(tokens, times(128)).findByHashForUpdate("hash");
    }
}
