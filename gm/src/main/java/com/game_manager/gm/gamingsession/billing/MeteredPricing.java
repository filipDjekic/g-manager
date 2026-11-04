package com.game_manager.gm.gamingsession.billing;
import java.math.*;
/** Round the cumulative total, never individual ticks. Started units are charged in full. */
public final class MeteredPricing {
    private MeteredPricing() {}
    public static BigDecimal total(BigDecimal price,long tariffSeconds,int unit,long seconds) {
        if(price.signum()<=0 || tariffSeconds<=0 || unit<=0 || seconds<0) throw new IllegalArgumentException("Invalid metered pricing");
        long units=seconds/unit+(seconds%unit==0?0:1);
        return price.multiply(BigDecimal.valueOf(units).multiply(BigDecimal.valueOf(unit))).divide(BigDecimal.valueOf(tariffSeconds),2,RoundingMode.HALF_UP);
    }
    public static long affordable(BigDecimal balance,BigDecimal price,long tariffSeconds,int unit) {
        long high=balance.multiply(BigDecimal.valueOf(tariffSeconds)).divide(price,0,RoundingMode.DOWN).longValueExact()/unit;
        // Conservative: a complete unit must be covered before access is granted.
        return Math.multiplyExact(high,unit);
    }
}
