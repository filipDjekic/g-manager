package com.game_manager.gm.architecture;

import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaModifier;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchCondition;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.lang.ConditionEvents;
import com.tngtech.archunit.lang.SimpleConditionEvent;
import jakarta.persistence.Entity;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.library.dependencies.SlicesRuleDefinition.slices;

@AnalyzeClasses(packages = "com.game_manager.gm")
class ModuleArchitectureTest {

    @ArchTest
    static final ArchRule feature_modules_are_free_of_cycles =
            slices()
                    .matching("com.game_manager.gm.(*)..")
                    .should().beFreeOfCycles()
                    .because("feature modules must form a directed dependency graph");

    @ArchTest
    static final ArchRule controllers_do_not_access_repositories =
            noClasses()
                    .that().haveSimpleNameEndingWith("Controller")
                    .should().dependOnClassesThat().haveSimpleNameEndingWith("Repository")
                    .because("controllers must delegate to an application service");

    @ArchTest
    static final ArchRule repositories_are_only_accessed_from_backend_components =
            noClasses()
                    .that().resideInAPackage("..dto..")
                    .should().dependOnClassesThat().haveSimpleNameEndingWith("Repository")
                    .because("DTOs are contracts and must not access persistence");

    @ArchTest
    static final ArchRule public_dto_contracts_do_not_expose_entities =
            classes()
                    .that().resideInAPackage("..dto..")
                    .should(notExposeJpaEntities())
                    .because("JPA entities must not leak through public DTO signatures");

    private static ArchCondition<JavaClass> notExposeJpaEntities() {
        return new ArchCondition<>("not expose JPA entities in public members") {
            @Override
            public void check(JavaClass item, ConditionEvents events) {
                item.getMethods().stream()
                        .filter(method -> method.getModifiers().contains(JavaModifier.PUBLIC))
                        .forEach(method ->
                                checkType(
                                        item, method.getRawReturnType(),
                                        method.getFullName(), events));
                item.getFields().stream()
                        .filter(field -> field.getModifiers().contains(JavaModifier.PUBLIC))
                        .forEach(field ->
                                checkType(item, field.getRawType(), field.getFullName(), events));
            }
        };
    }

    private static void checkType(
            JavaClass owner, JavaClass exposedType, String member, ConditionEvents events) {
        if (exposedType.isAnnotatedWith(Entity.class)) {
            events.add(SimpleConditionEvent.violated(
                    owner, member + " exposes JPA entity " + exposedType.getName()));
        }
    }
}
