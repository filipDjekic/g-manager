package com.game_manager.gm.gamingsession;
import com.game_manager.gm.gamingsession.billing.MeteredPricing;
import java.math.BigDecimal;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
class MeteredPricingTest {
 @Test void exactExamplesAndCumulativeRounding(){for(int minutes:new int[]{10,20,30,60}) assertThat(MeteredPricing.total(new BigDecimal("300"),3600,1,minutes*60)).isEqualByComparingTo(BigDecimal.valueOf(minutes*5));BigDecimal previous=BigDecimal.ZERO,sum=BigDecimal.ZERO;for(int s=1;s<=1200;s++){BigDecimal next=MeteredPricing.total(new BigDecimal("300"),3600,1,s);sum=sum.add(next.subtract(previous));previous=next;}assertThat(sum).isEqualByComparingTo("100");}
 @Test void startedUnitsAndCoverage(){assertThat(MeteredPricing.total(new BigDecimal("300"),3600,60,61)).isEqualByComparingTo("10");assertThat(MeteredPricing.affordable(new BigDecimal("4.99"),new BigDecimal("300"),3600,60)).isZero();assertThat(MeteredPricing.total(new BigDecimal("300"),3600,1,0)).isZero();}
}
