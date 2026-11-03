package com.game_manager.gm.common.operations;

import java.lang.reflect.Method;
import org.springframework.aop.Advisor;
import org.springframework.aop.support.DefaultPointcutAdvisor;
import org.springframework.aop.support.StaticMethodMatcherPointcut;
import org.aopalliance.intercept.MethodInterceptor;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.*;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.transaction.annotation.Transactional;

/** Hold through the outer transaction commit. Machine leases/heartbeat/lock ACK remain reachable. */
@Configuration(proxyBeanMethods=false) @Role(BeanDefinition.ROLE_INFRASTRUCTURE)
public class BackupWriteBarrier {
    @Bean @Role(BeanDefinition.ROLE_INFRASTRUCTURE)
    public Advisor backupWriteAdvisor(org.springframework.beans.factory.ObjectProvider<BackupQuiescence> barrier) {
        var pointcut=new StaticMethodMatcherPointcut(){
            @Override public boolean matches(Method method,Class<?> type){
                if(!type.getName().startsWith("com.game_manager.gm.")||type.getName().startsWith("com.game_manager.gm.machine."))return false;
                var transaction=AnnotatedElementUtils.findMergedAnnotation(method,Transactional.class);
                if(transaction==null)transaction=AnnotatedElementUtils.findMergedAnnotation(type,Transactional.class);
                return transaction!=null&&!transaction.readOnly();
            }
        };
        var advisor=new DefaultPointcutAdvisor(pointcut,(MethodInterceptor)call->{try(var ignored=barrier.getObject().enter()){return call.proceed();}});
        advisor.setOrder(Ordered.HIGHEST_PRECEDENCE+50);return advisor;
    }
}
