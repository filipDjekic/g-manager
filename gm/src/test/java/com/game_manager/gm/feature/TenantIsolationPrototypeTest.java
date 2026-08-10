package com.game_manager.gm.feature;
import static org.assertj.core.api.Assertions.*;
import java.util.*;
import org.junit.jupiter.api.Test;
class TenantIsolationPrototypeTest {
    private record TrustedIdentity(UUID userId, UUID tenantId) {} private record Row(UUID tenantId,String value) {}
    @Test void sharedSchemaGuardUsesTrustedIdentityAndRejectsMissingBackgroundContext(){UUID a=UUID.randomUUID(),b=UUID.randomUUID();List<Row>rows=List.of(new Row(a,"A"),new Row(b,"B"));TrustedIdentity identity=new TrustedIdentity(UUID.randomUUID(),a);UUID forgedHeader=b;List<Row>visible=rows.stream().filter(row->row.tenantId().equals(identity.tenantId())).toList();assertThat(visible).extracting(Row::value).containsExactly("A");assertThat(visible).noneMatch(row->row.tenantId().equals(forgedHeader));assertThatThrownBy(()->requireTenant(null)).isInstanceOf(IllegalStateException.class).hasMessage("Trusted tenant context is required");}
    private UUID requireTenant(TrustedIdentity identity){if(identity==null)throw new IllegalStateException("Trusted tenant context is required");return identity.tenantId();}
}
