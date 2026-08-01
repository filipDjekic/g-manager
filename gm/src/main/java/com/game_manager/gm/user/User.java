package com.game_manager.gm.user;

import com.game_manager.gm.common.entity.BaseEntity;
import lombok.AllArgsConstructor;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.Getter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class User extends BaseEntity {
    String name;
    String email;
    String passwordHash;
    Role role;
    boolean active;
}
